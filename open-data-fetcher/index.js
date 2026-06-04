#!/usr/bin/env node
/**
 * Fetches Rotterdam municipal trees from the city's public WFS service.
 *
 * Source:  Gemeente Rotterdam, Beheer Buitenruimte
 * WFS:     https://ows.gis.rotterdam.nl/cgi-bin/mapserv.exe
 * Layer:   ms:obs_bmn_alg  ("bomen algemeen")
 * License: Creative Commons Public Domain Mark 1.0
 *
 * Usage:
 *   node index.js                         # fetch first 100 trees → bomen-rotterdam.json
 *   node index.js -d                      # dry run: print JSON to console only
 *   node index.js --count 500             # fetch 500 trees
 *   node index.js --count 500 --page 1    # second page of 500
 *   node index.js --all                   # fetch all trees (many requests)
 *   node index.js --all --format sqlite   # fetch all → bomen-rotterdam.db
 *   node index.js --layer ms:obs_bmn_bijz # notable trees only
 *
 * Available layers:
 *   ms:obs_bmn_alg    bomen algemeen (all trees — default)
 *   ms:obs_bmn_gesl   bomen naar geslacht (by genus)
 *   ms:obs_bmn_bos    bomen in bosplantsoen (in forest plantings)
 *   ms:obs_bmn_bijz   bomen met bijzonderheid (notable trees)
 *   ms:obs_bmn_kroon  bomen naar kroonprojectie (by crown projection)
 */

import https from 'https';
import fs from 'fs/promises';
import initSqlJs from 'sql.js';
import { parseStringPromise, processors } from 'xml2js';


// ── Field mapping ────────────────────────────────────────────────────────────
// Only fields listed here are kept in the output.

const FIELD_MAP = {
    ID: 'id',
    AANLEGJAAR: 'year_planted',
    BOOMSORTIMENT_NEDERLANDS: 'name_indigenous',
    BOOMSORTIMENT: 'species',
    GESLACHT: 'genus',
    WIJK: 'neighbourhood',
    STRAAT: 'street',
    DIAMETER: 'trunk_diameter',
    KROONOMVANG: 'crown_spread',
    LAATSTE_MUTATIE: 'last_updated',
};

// WFS PROPERTYNAME: geometry field + every attribute field in FIELD_MAP.
// This tells the server to omit all other fields from the GML response.
const PROPERTY_NAMES = ['GEOM', ...Object.keys(FIELD_MAP)].join(',');

// ── DB column order ───────────────────────────────────────────────────────────

const DB_COLS = [
    'lat', 'lon', 'id', 'year_planted', 'name_indigenous',
    'species', 'species_binomial', 'species_cultivar',
    'genus', 'neighbourhood', 'street',
    'trunk_diameter', 'crown_spread', 'last_updated',
];

// ── Species / indigenous-name sanitisation ────────────────────────────────────

const NON_BOTANICAL = new Set([
    'ASSORTIMENT ONBEKEND',
    'CONIFEREN',
    'OVERIG',
    'NIET (REGULIER) INBOETEN',
]);

// Rank markers that indicate a subspecies / variety / forma — not a cultivar.
const RANK_MARKERS = new Set([
    'SUBSP.', 'SUBSP', 'VAR.', 'VAR', 'F.', 'CV.', 'CV*', 'CV',
]);

function applySpeciesTypoCorrections(s) {
    return s
        .replace(/\bMETASQUOIA\b/, 'METASEQUOIA')
        .replace(/\bPTEROCAYRA\b/, 'PTEROCARYA')
        .replace(/HIBISCUS SYR\./, 'HIBISCUS SYRIACUS');
}

function applyIndigenousTypoCorrections(s) {
    return s.replace(/\bSIERAPPPEL\b/, 'SIERAPPEL');
}

function extractSpeciesBinomial(s) {
    if (!s) return null;
    // Strip from first quote or opening paren onward (cultivar / trade name)
    s = s.replace(/'.*$/, '').replace(/\(.*$/, '').trim();
    // Strip rank markers and everything after
    s = s.replace(/\s+(SUBSP\.|SUBSP|VAR\.|VAR|F\.|CV\.|CV\*|CV)(\s|$).*/i, '').trim();
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;
    if (words.length === 1) return words[0];
    if (words[1] === '×' && words[2]) return `${words[0]} × ${words[2]}`;
    return `${words[0]} ${words[1]}`;
}

function extractSpeciesCultivar(s) {
    if (!s) return null;
    // Case 1: ICNCP code in parentheses ('CODE') — most stable cross-source identifier
    const icncp = s.match(/\('([^')]+)'\)?/);
    if (icncp) return icncp[1].trim() || null;
    // Case 2: quoted cultivar name 'NAME'
    const quoted = s.match(/'([^']+)'/);
    if (quoted) return quoted[1].trim() || null;
    // Case 3: words after the binomial that aren't rank markers
    const words = s.split(/\s+/).filter(Boolean);
    const skip = (words[1] === '×') ? 3 : 2;
    if (words.length <= skip) return null;
    const rest = words.slice(skip);
    if (RANK_MARKERS.has(rest[0])) return null;
    const filtered = rest
        .filter(w => !RANK_MARKERS.has(w))
        .join(' ')
        .replace(/\(.*$/, '')   // strip unclosed or closed parentheticals
        .replace(/\([^)]*\)/g, '')
        .trim();
    return filtered || null;
}

function sanitiseIndigenousName(s) {
    if (!s) return null;
    s = s.trim().replace(/\s+/g, ' ');
    // Strip leading-dash pure-admin entries
    if (s.startsWith('-')) return null;
    // Strip admin suffix (everything from first ' -' onward)
    const dashIdx = s.indexOf(' -');
    if (dashIdx !== -1) s = s.slice(0, dashIdx).trim();
    // Strip trailing (CV) and (V) markers
    s = s.replace(/\s*\(CV\)\s*$/i, '').replace(/\s*\(V\)\s*$/i, '').trim();
    // Null-check known pure-admin strings
    if (!s || s.toUpperCase() === 'NIET INBOETEN') return null;
    return s;
}

function sanitiseTree(tree) {
    if (!tree) return null;
    const rawSpecies = ((tree.species ?? '').trim().replace(/\s+/g, ' ')).toUpperCase();
    // Skip non-botanical entries entirely
    if (NON_BOTANICAL.has(rawSpecies)) return null;
    // Compute species fields from typo-corrected uppercase value
    const corrected = applySpeciesTypoCorrections(rawSpecies);
    tree.species_binomial = extractSpeciesBinomial(corrected);
    if (!tree.species_binomial) return null;
    tree.species_cultivar  = extractSpeciesCultivar(corrected);
    // Sanitise indigenous name (write clean value directly)
    const rawIndigenous = (tree.name_indigenous ?? '').trim().replace(/\s+/g, ' ');
    tree.name_indigenous = sanitiseIndigenousName(applyIndigenousTypoCorrections(rawIndigenous));
    return tree;
}

const WFS_URL = 'https://ows.gis.rotterdam.nl/cgi-bin/mapserv.exe';
const MAP     = 'd:\\gwr\\webdata\\mapserver\\map\\bbdwh_pub.map';

// Rotterdam's WFS server has a certificate chain issue; disable verification.
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ── WFS request ──────────────────────────────────────────────────────────────

function fetchRaw(params, onProgress) {
    return new Promise((resolve, reject) => {
        const req = https.get(`${WFS_URL}?${params}`, { agent: httpsAgent }, res => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage}`));
                res.resume();
                return;
            }
            const total  = parseInt(res.headers['content-length'] ?? '0', 10);
            let received = 0;
            const chunks = [];
            res.on('data', chunk => {
                chunks.push(chunk);
                received += chunk.length;
                onProgress?.(received, total);
            });
            res.on('end', () => {
                // Server declares UTF-8 but sends ISO-8859-1 bytes (server bug).
                // latin1 is lossless for any single-byte encoding: byte 0xNN → U+00NN.
                resolve(Buffer.concat(chunks).toString('latin1'));
            });
        });
        req.on('error', reject);
    });
}

function fetchPage(layer, count, startIndex, onProgress) {
    return fetchRaw(new URLSearchParams({
        map: MAP, SERVICE: 'WFS', VERSION: '2.0.0',
        REQUEST: 'GetFeature', TYPENAMES: layer,
        // Request WGS84 directly so the server applies its own accurate transformation
        // (RDNAPTRANS2018 grid correction) instead of our ~29 m Helmert approximation.
        // EPSG:4326 in WFS 2.0.0 returns coordinates as (lat, lon) per the EPSG axis order.
        SRSNAME: 'urn:ogc:def:crs:EPSG::4326',
        COUNT: String(count), STARTINDEX: String(startIndex),
        PROPERTYNAME: PROPERTY_NAMES,
    }), onProgress);
}

async function fetchCount(layer) {
    const xml = await fetchRaw(new URLSearchParams({
        map: MAP, SERVICE: 'WFS', VERSION: '2.0.0',
        REQUEST: 'GetFeature', TYPENAMES: layer, resultType: 'hits',
    }));
    const doc = await parseStringPromise(xml, {
        explicitArray: false, tagNameProcessors: [processors.stripPrefix],
    });
    return parseInt(doc?.FeatureCollection?.$.numberMatched ?? '0', 10) || 0;
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function drawProgress(fetched, total) {
    if (!process.stderr.isTTY) return;
    const W      = 40;
    const pct    = total > 0 ? fetched / total : 0;
    const filled = Math.round(W * pct);
    const bar    = '='.repeat(filled).padEnd(W);
    const label  = `${fetched} / ${total} (${Math.round(pct * 100)}%)`;
    process.stderr.write(`\r[${bar}] ${label}  `);
    if (fetched >= total) process.stderr.write('\n');
}


// ── GML / XML parsing ────────────────────────────────────────────────────────

function parsePoint(geomNode) {
    if (!geomNode) return null;
    const point = geomNode.Point ?? geomNode['gml:Point'];
    if (!point) return null;
    const raw = point.pos ?? point['gml:pos'];
    if (!raw) return null;
    const parts = (typeof raw === 'string' ? raw : raw[0]).trim().split(/\s+/);
    if (parts.length < 2) return null;
    // SRSNAME=urn:ogc:def:crs:EPSG::4326 → WFS 2.0.0 returns (lat, lon) per EPSG axis order
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    return { lat: +lat.toFixed(7), lon: +lon.toFixed(7) };
}

function toTree(featureNode) {
    if (!featureNode) return null;

    const tree = {};

    // Detect geometry by presence of a nested Point element
    for (const [key, val] of Object.entries(featureNode)) {
        if (key === '$') continue;
        const scalar = Array.isArray(val) ? val[0] : val;

        if (scalar && typeof scalar === 'object' && (scalar.Point ?? scalar['gml:Point'])) {
            const coords = parsePoint(scalar);
            if (coords) { tree.lat = coords.lat; tree.lon = coords.lon; }
            continue;
        }

        const mapped = FIELD_MAP[key];
        if (!mapped) continue;

        const text = typeof scalar === 'string' ? scalar : (scalar?._ ?? '');
        tree[mapped] = text;
    }

    return tree;
}

async function parseGML(xml, layer) {
    const doc = await parseStringPromise(xml, {
        explicitArray: false,
        tagNameProcessors: [processors.stripPrefix],
        attrNameProcessors: [processors.stripPrefix],
    });

    if (doc?.ExceptionReport) {
        const msg = doc.ExceptionReport.Exception?.ExceptionText ?? JSON.stringify(doc.ExceptionReport);
        throw new Error(`WFS exception: ${msg}`);
    }

    const collection = doc?.FeatureCollection;
    if (!collection) throw new Error('No FeatureCollection in response');

    let members = collection.member ?? [];
    if (!Array.isArray(members)) members = [members];

    const localName = layer.split(':').pop();
    const trees = members.map(m => sanitiseTree(toTree(m[localName]))).filter(Boolean);
    return { trees, rawCount: members.length };
}

// ── Output writers ────────────────────────────────────────────────────────────

async function writeJSON(trees, file) {
    await fs.writeFile(file, JSON.stringify(trees, null, 2), 'utf8');
}

async function writeSQLite(trees, file) {
    const SQL = await initSqlJs();
    const db  = new SQL.Database();

    db.run(`CREATE TABLE trees (${DB_COLS.join(', ')})`);
    db.run(`CREATE INDEX idx_lat_lon          ON trees (lat, lon)`);
    db.run(`CREATE INDEX idx_species          ON trees (species)`);
    db.run(`CREATE INDEX idx_species_binomial ON trees (species_binomial)`);
    db.run(`CREATE INDEX idx_species_cultivar ON trees (species_binomial, species_cultivar)`);

    const placeholders = DB_COLS.map(() => '?').join(', ');
    const stmt = db.prepare(`INSERT INTO trees VALUES (${placeholders})`);
    for (const tree of trees) {
        stmt.run(DB_COLS.map(c => tree[c] ?? null));
    }
    stmt.free();

    await fs.writeFile(file, Buffer.from(db.export()));
    db.close();
}

// ── CLI argument parsing ──────────────────────────────────────────────────────

function parseArgs(argv) {
    const args = { count: 100, page: 0, all: false, dry: false, format: 'json', layer: 'ms:obs_bmn_alg' };
    for (let i = 0; i < argv.length; i++) {
        switch (argv[i]) {
            case '--count':  args.count  = parseInt(argv[++i], 10); break;
            case '--page':   args.page   = parseInt(argv[++i], 10); break;
            case '--layer':  args.layer  = argv[++i];               break;
            case '--format': args.format = argv[++i];               break;
            case '--all':    args.all    = true;                     break;
            case '-d':       args.dry    = true;                     break;
        }
    }
    return args;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const args = parseArgs(process.argv.slice(2));

    let trees = [];

    if (args.all) {
        const pageSize = 1000;
        let startIndex = 0;

        process.stderr.write('Counting trees...\n');
        const total = await fetchCount(args.layer);
        process.stderr.write(`${total} trees in dataset.\n`);
        drawProgress(0, total);

        while (true) {
            const xml = await fetchPage(args.layer, pageSize, startIndex);
            const { trees: page, rawCount } = await parseGML(xml, args.layer);
            trees.push(...page);
            drawProgress(trees.length, total);
            if (rawCount < pageSize) break;
            startIndex += pageSize;
        }
    } else {
        const startIndex = args.page * args.count;
        const xml = await fetchPage(args.layer, args.count, startIndex);
        const { trees: page } = await parseGML(xml, args.layer);
        trees = page;
        drawProgress(trees.length, args.count);
    }

    process.stderr.write(`Got ${trees.length} trees.\n`);

    if (args.dry) {
        process.stdout.write(JSON.stringify(trees, null, 2) + '\n');
        return;
    }

    if (args.format === 'sqlite') {
        const file = 'bomen-rotterdam.db';
        process.stderr.write('Writing SQLite database...\n');
        await writeSQLite(trees, file);
        process.stderr.write(`Written to ${file}\n`);
    } else {
        const file = 'bomen-rotterdam.json';
        await writeJSON(trees, file);
        process.stderr.write(`Written to ${file}\n`);
    }
}

main().catch(err => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
});
