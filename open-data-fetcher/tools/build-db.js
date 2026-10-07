/**
 * Builds the national databases the API serves from the per-source fetcher output:
 *
 *   data/<source>.db + data/vernacular-*.db + sources.json
 *     → ../api/data/trees.db   trees of every source + precomputed cluster/species pyramids
 *     → ../api/data/meta.db    sources, species dictionary (with vernacular names), species per source,
 *                              build version
 *
 * The per-source dbs stay the source of truth; this script can be rerun at any time.
 * Writes to *.tmp files and renames at the end, so a failed build never leaves a half-written db.
 *
 * Usage: node tools/build-db.js [--out <dir>]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, renameSync, rmSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');

// Zoom range of the precomputed pyramids. Must match the API's MIN/MAX_PYRAMID_ZOOM.
const MIN_Z = 5;
const MAX_Z = 17;
// Web-mercator pixel coordinates are computed once at MAX_Z and shifted down for lower zooms.
// Species-filtered clusters are precomputed up to this zoom; above it the API buckets them live
// (few enough rows per tile by then). Must match the API's MAX_SPECIES_CELL_ZOOM.
const MAX_SPECIES_CELL_Z = 11;
const CELL_SHIFT = 6;  // 64 px cluster cells
const TILE_SHIFT = 8;  // 256 px tiles

function parseArgs(argv) {
    const args = { out: path.resolve(ROOT, '..', 'api', 'data') };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--out') args.out = path.resolve(argv[++i]);
    }
    return args;
}

// Rows sharing a source id within this distance are the same tree listed twice.
const DUPLICATE_RADIUS_M = 5;
// An id shared by more rows than this within one source is a placeholder, not an identity.
const PLACEHOLDER_ID_MIN_ROWS = 10;

function distanceM(lat1, lon1, lat2, lon2) {
    const dy = (lat2 - lat1) * 111320;
    const dx = (lon2 - lon1) * 111320 * Math.cos(lat1 * Math.PI / 180);
    return Math.hypot(dx, dy);
}

function log(msg) { process.stdout.write(msg + '\n'); }

function openFresh(file) {
    rmSync(file, { force: true });
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA temp_store = MEMORY; PRAGMA cache_size = -200000;');
    return db;
}

function mercatorPx(lat, lon) {
    const scale = 256 * 2 ** MAX_Z;
    const r = lat * Math.PI / 180;
    return [
        Math.floor((lon + 180) / 360 * scale),
        Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * scale),
    ];
}

function buildVersion() {
    return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

// ── Vernacular names ─────────────────────────────────────────────────────────

// Same priority as the old API: iNaturalist base names for all locales, Dutch curated overrides win for nl.
function loadVernacular() {
    const names = new Map();
    const basePath = path.join(DATA_DIR, 'vernacular-base.db');
    if (existsSync(basePath)) {
        const db = new DatabaseSync(basePath, { readOnly: true });
        for (const r of db.prepare('SELECT species_binomial, nl, en, de, fr FROM vernacular_base').iterate()) {
            names.set(r.species_binomial.toUpperCase(), { nl: r.nl, en: r.en, de: r.de, fr: r.fr });
        }
        db.close();
    } else log('  ⚠ vernacular-base.db not found — no base vernacular names');

    const nlPath = path.join(DATA_DIR, 'vernacular-nl.db');
    if (existsSync(nlPath)) {
        const db = new DatabaseSync(nlPath, { readOnly: true });
        for (const r of db.prepare('SELECT species_binomial, name_vernacular FROM vernacular_nl').iterate()) {
            const key = r.species_binomial.toUpperCase();
            names.set(key, { ...(names.get(key) ?? {}), nl: r.name_vernacular });
        }
        db.close();
    } else log('  ⚠ vernacular-nl.db not found — no Dutch overrides');
    return names;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
    const t0 = Date.now();
    const { out } = parseArgs(process.argv.slice(2));
    const sources = JSON.parse(readFileSync(path.join(ROOT, 'sources.json'), 'utf8'));

    const treesTmp = path.join(out, 'trees.db.tmp');
    const metaTmp  = path.join(out, 'meta.db.tmp');
    const trees    = openFresh(treesTmp);
    const meta     = openFresh(metaTmp);

    trees.exec(`
        CREATE TABLE staging (
            source_idx INTEGER, id TEXT, lat REAL, lon REAL, species_id INTEGER,
            species TEXT, species_cultivar TEXT, name_vernacular_src TEXT, year_planted TEXT,
            neighbourhood TEXT, street TEXT, trunk_diameter TEXT, crown_spread TEXT
        );
    `);
    const insertStaging = trees.prepare('INSERT INTO staging VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');

    // species key → { id, binomial, count, srcNames: Map<name, count> }
    const species = new Map();
    const speciesOf = (binomial, raw) => {
        const key = binomial ?? raw;
        let s = species.get(key);
        if (!s) { s = { id: species.size + 1, key, binomial, count: 0, srcNames: new Map() }; species.set(key, s); }
        return s;
    };

    // Pyramids, keyed numerically: cells z → Map(cx * 2^24 + cy → [count, sumLat, sumLon]),
    // tileSpecies z → Map((tx * 2^22 + ty) * 2^14 + speciesId → count),
    // tileSources z → Map((tx * 2^22 + ty) * 2^8 + sourceIdx → count).
    const cells = new Map(), tileSpecies = new Map(), tileSources = new Map(), speciesCells = new Map();
    for (let z = MIN_Z; z <= MAX_Z; z++) { cells.set(z, new Map()); tileSpecies.set(z, new Map()); tileSources.set(z, new Map()); speciesCells.set(z, new Map()); }

    const sourceRows = [];
    let total = 0, skippedNoCoords = 0, duplicates = 0, renamedIds = 0, generatedIds = 0;

    log('Reading sources...');
    trees.exec('BEGIN');
    sources.forEach((src, i) => {
        const idx = i + 1;
        const dbPath = path.join(DATA_DIR, `${src.id}.db`);
        if (!existsSync(dbPath)) { log(`  ⚠ ${src.id}: no ${src.id}.db — skipped`); return; }

        const db = new DatabaseSync(dbPath, { readOnly: true });
        let n = 0, s = 90, nn = -90, w = 180, e = -180, lastFetched = null;
        const speciesCounts = new Map();  // species id → trees of this source
        // Source ids are not always unique: some datasets list the same tree twice (identical or
        // sub-metre positions), others reuse an id for different trees (Gorinchem). Same id and
        // species within DUPLICATE_RADIUS_M → same tree, keep one; otherwise a different tree, kept
        // under a suffixed id ("1~2") so it stays addressable. The species check matters for ids
        // derived from coordinates (Ridderkerk): two trees planted on one point share such an id.
        // Ids shared by many rows are placeholders ("undefined" for all of Dordrecht, "Onbekend" in
        // Deventer), not identities: those rows are all kept, numbered, without duplicate detection.
        const seen = new Map();  // id → [[lat, lon, species], ...] of kept rows
        const placeholders = new Set(db.prepare('SELECT id FROM trees GROUP BY id HAVING COUNT(*) > ?')
            .all(PLACEHOLDER_ID_MIN_ROWS).map((r) => String(r.id)));
        for (const id of placeholders) log(`  ⚠ ${src.id}: id "${id}" is a placeholder — trees get generated ids`);
        const placeholderSeq = new Map();
        for (const r of db.prepare('SELECT * FROM trees').iterate()) {
            const lat = Number(r.lat), lon = Number(r.lon);
            if (r.lat == null || r.lon == null || !isFinite(lat) || !isFinite(lon)) { skippedNoCoords++; continue; }
            let id = String(r.id);
            const speciesKey = r.species_binomial ?? r.species;
            const kept = seen.get(id);
            if (placeholders.has(id)) {
                const seq = (placeholderSeq.get(id) ?? 0) + 1;
                placeholderSeq.set(id, seq);
                id = `${id}~${seq}`;
                generatedIds++;
            } else if (kept) {
                const sameTree = kept.some(([la, lo, sp]) =>
                    sp === speciesKey && distanceM(la, lo, lat, lon) <= DUPLICATE_RADIUS_M);
                if (sameTree) { duplicates++; continue; }
                kept.push([lat, lon, speciesKey]);
                id = `${id}~${kept.length}`;
                renamedIds++;
            } else seen.set(id, [[lat, lon, speciesKey]]);

            const sp = speciesOf(r.species_binomial, r.species);
            sp.count++;
            speciesCounts.set(sp.id, (speciesCounts.get(sp.id) ?? 0) + 1);
            if (r.name_vernacular) sp.srcNames.set(r.name_vernacular, (sp.srcNames.get(r.name_vernacular) ?? 0) + 1);

            insertStaging.run(idx, id, lat, lon, sp.id, r.species, r.species_cultivar, r.name_vernacular,
                r.year_planted, r.neighbourhood, r.street,
                r.trunk_diameter == null ? null : String(r.trunk_diameter),
                r.crown_spread == null ? null : String(r.crown_spread));

            const [px, py] = mercatorPx(lat, lon);
            for (let z = MIN_Z; z <= MAX_Z; z++) {
                const shift = MAX_Z - z;
                const cx = px >> (shift + CELL_SHIFT), cy = py >> (shift + CELL_SHIFT);
                const ck = cx * 2 ** 24 + cy;
                const c = cells.get(z).get(ck);
                if (c) { c[0]++; c[1] += lat; c[2] += lon; } else cells.get(z).set(ck, [1, lat, lon]);
                if (z <= MAX_SPECIES_CELL_Z) {
                    const sck = ck * 2 ** 14 + sp.id;
                    const sc = speciesCells.get(z).get(sck);
                    if (sc) { sc[0]++; sc[1] += lat; sc[2] += lon; } else speciesCells.get(z).set(sck, [1, lat, lon]);
                }

                const tx = px >> (shift + TILE_SHIFT), ty = py >> (shift + TILE_SHIFT);
                const tk = (tx * 2 ** 22 + ty) * 2 ** 14 + sp.id;
                const ts = tileSpecies.get(z);
                ts.set(tk, (ts.get(tk) ?? 0) + 1);
                const sk = (tx * 2 ** 22 + ty) * 2 ** 8 + idx;
                const tsrc = tileSources.get(z);
                tsrc.set(sk, (tsrc.get(sk) ?? 0) + 1);
            }

            if (lat < s) s = lat; if (lat > nn) nn = lat;
            if (lon < w) w = lon; if (lon > e) e = lon;
            if (r.last_fetched && (!lastFetched || r.last_fetched > lastFetched)) lastFetched = r.last_fetched;
            n++;
        }
        db.close();
        total += n;
        const fetched = (lastFetched ?? statSync(dbPath).mtime.toISOString()).slice(0, 10);
        sourceRows.push({ idx, src, n, bbox: n ? [s, nn, w, e] : null, fetched, speciesCounts });
        log(`  ${src.id.padEnd(28)} ${String(n).padStart(8)}`);
    });
    trees.exec('COMMIT');
    if (sources.length >= 2 ** 8) throw new Error(`Too many sources (${sources.length}) for the tile_source key encoding`);
    if (species.size >= 2 ** 14) throw new Error(`Too many species (${species.size}) for the tile_species key encoding`);

    log('Writing trees (sorted by position)...');
    trees.exec(`
        CREATE TABLE trees (
            source_idx INTEGER NOT NULL, id TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
            species_id INTEGER NOT NULL, species TEXT, species_cultivar TEXT, name_vernacular_src TEXT,
            year_planted TEXT, neighbourhood TEXT, street TEXT, trunk_diameter TEXT, crown_spread TEXT
        );
        INSERT INTO trees SELECT * FROM staging ORDER BY lat, lon;
        DROP TABLE staging;
    `);
    trees.exec(`
        CREATE UNIQUE INDEX idx_source_id ON trees (source_idx, id);
        CREATE INDEX idx_lat_lon          ON trees (lat, lon);
        CREATE INDEX idx_species_lat_lon  ON trees (species_id, lat, lon);
    `);

    log('Writing pyramids...');
    trees.exec(`
        CREATE TABLE cluster_cell (z INTEGER, cx INTEGER, cy INTEGER, count INTEGER, lat REAL, lon REAL,
                                   PRIMARY KEY (z, cx, cy)) WITHOUT ROWID;
        CREATE TABLE tile_species (z INTEGER, x INTEGER, y INTEGER, species_id INTEGER, count INTEGER,
                                   PRIMARY KEY (z, x, y, species_id)) WITHOUT ROWID;
        CREATE TABLE species_cell (z INTEGER, species_id INTEGER, cx INTEGER, cy INTEGER, count INTEGER, lat REAL, lon REAL,
                                   PRIMARY KEY (z, species_id, cx, cy)) WITHOUT ROWID;
        CREATE TABLE tile_source  (z INTEGER, x INTEGER, y INTEGER, source_idx INTEGER, count INTEGER,
                                   PRIMARY KEY (z, x, y, source_idx)) WITHOUT ROWID;
    `);
    trees.exec('BEGIN');
    const insCell = trees.prepare('INSERT INTO cluster_cell VALUES (?,?,?,?,?,?)');
    const insTs   = trees.prepare('INSERT INTO tile_species VALUES (?,?,?,?,?)');
    const insTsrc = trees.prepare('INSERT INTO tile_source VALUES (?,?,?,?,?)');
    const insSc   = trees.prepare('INSERT INTO species_cell VALUES (?,?,?,?,?,?,?)');
    let cellRows = 0, tsRows = 0, tsrcRows = 0, scRows = 0;
    for (let z = MIN_Z; z <= MAX_Z; z++) {
        for (const [k, [n, sLat, sLon]] of cells.get(z)) {
            insCell.run(z, Math.floor(k / 2 ** 24), k % 2 ** 24, n, +(sLat / n).toFixed(6), +(sLon / n).toFixed(6));
            cellRows++;
        }
        for (const [k, n] of tileSpecies.get(z)) {
            const spId = k % 2 ** 14, t = Math.floor(k / 2 ** 14);
            insTs.run(z, Math.floor(t / 2 ** 22), t % 2 ** 22, spId, n);
            tsRows++;
        }
        for (const [k, n] of tileSources.get(z)) {
            const srcIdx = k % 2 ** 8, t = Math.floor(k / 2 ** 8);
            insTsrc.run(z, Math.floor(t / 2 ** 22), t % 2 ** 22, srcIdx, n);
            tsrcRows++;
        }
        for (const [k, [n, sLat, sLon]] of speciesCells.get(z)) {
            const spId = k % 2 ** 14, ck = Math.floor(k / 2 ** 14);
            insSc.run(z, spId, Math.floor(ck / 2 ** 24), ck % 2 ** 24, n, +(sLat / n).toFixed(6), +(sLon / n).toFixed(6));
            scRows++;
        }
    }
    trees.exec('COMMIT');

    log('Writing meta...');
    const version = buildVersion();
    const vernacular = loadVernacular();
    meta.exec(`
        CREATE TABLE build (version TEXT, built_at TEXT, tree_count INTEGER);
        CREATE TABLE sources (
            idx INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
            center_lat REAL, center_lon REAL, s REAL, n REAL, w REAL, e REAL,
            tree_count INTEGER, last_fetched TEXT, cluster_disable_zoom INTEGER, meta_json TEXT
        );
        CREATE TABLE species (
            id INTEGER PRIMARY KEY, key TEXT UNIQUE NOT NULL, binomial TEXT, count INTEGER,
            nl TEXT, en TEXT, de TEXT, fr TEXT
        );
        CREATE TABLE source_species (source_idx INTEGER, species_id INTEGER, count INTEGER,
                                     PRIMARY KEY (source_idx, species_id)) WITHOUT ROWID;
    `);
    meta.prepare('INSERT INTO build VALUES (?,?,?)').run(version, new Date().toISOString(), total);
    const insSource = meta.prepare('INSERT INTO sources VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const { idx, src, n, bbox, fetched } of sourceRows) {
        const [s, nn, w, e] = bbox ?? [null, null, null, null];
        insSource.run(idx, src.id, src.name, src.type ?? 'city', src.center[0], src.center[1], s, nn, w, e,
            n, fetched, src.clusterDisableZoom ?? null, JSON.stringify(src.meta ?? {}));
    }
    const insSpecies = meta.prepare('INSERT INTO species VALUES (?,?,?,?,?,?,?,?)');
    const insSourceSpecies = meta.prepare('INSERT INTO source_species VALUES (?,?,?)');
    meta.exec('BEGIN');
    // Species per source, for the place pages (api/page.php): species count and most common species.
    for (const { idx, speciesCounts } of sourceRows) {
        for (const [spId, n] of speciesCounts) insSourceSpecies.run(idx, spId, n);
    }
    for (const sp of species.values()) {
        const v = vernacular.get(sp.key.toUpperCase()) ?? {};
        // No curated/iNaturalist Dutch name: fall back to the name the source datasets use most for this species.
        const srcNl = [...sp.srcNames.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        insSpecies.run(sp.id, sp.key, sp.binomial, sp.count, v.nl ?? srcNl, v.en ?? null, v.de ?? null, v.fr ?? null);
    }
    meta.exec('COMMIT');

    for (const db of [trees, meta]) { db.exec('ANALYZE; VACUUM;'); db.close(); }
    renameSync(treesTmp, path.join(out, 'trees.db'));
    renameSync(metaTmp, path.join(out, 'meta.db'));

    const mb = (f) => (statSync(path.join(out, f)).size / 1e6).toFixed(1) + ' MB';
    log(`\nBuild ${version}`);
    log(`  trees:        ${total.toLocaleString()} from ${sourceRows.length} sources (${skippedNoCoords} without coordinates skipped)`);
    log(`  duplicates:   ${duplicates.toLocaleString()} dropped (same id and species within ${DUPLICATE_RADIUS_M} m), ${renamedIds.toLocaleString()} kept under a suffixed id`);
    log(`  placeholders: ${generatedIds.toLocaleString()} trees with a placeholder id got a generated id`);
    log(`  species:      ${species.size.toLocaleString()}`);
    log(`  cluster_cell: ${cellRows.toLocaleString()} rows, tile_species: ${tsRows.toLocaleString()} rows, tile_source: ${tsrcRows.toLocaleString()} rows, species_cell: ${scRows.toLocaleString()} rows`);
    log(`  trees.db ${mb('trees.db')}, meta.db ${mb('meta.db')}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

main();
