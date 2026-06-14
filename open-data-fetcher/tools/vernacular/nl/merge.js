#!/usr/bin/env node
/**
 * Fetch Wikipedia + Bomenbieb species data, merge with database vote results,
 * and write vernacular-nl.db with source priority:
 *   wikipedia > bomenbieb > database votes
 *
 * Usage: node tools/vernacular/nl/merge.js [--no-cache]
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import initSqlJs from 'sql.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data');
const OUT_FILE  = path.join(DATA_DIR, 'vernacular-nl.db');
const SOURCES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sources');

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function fetchHtml(url) {
    return new Promise((resolve, reject) => {
        const opts = { rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0 bomen-research' } };
        https.get(url, opts, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchHtml(res.headers.location).then(resolve, reject);
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            res.on('error', reject);
        }).on('error', reject);
    });
}

// ─── Binomial normalisation ───────────────────────────────────────────────────

function toBinomial(sci) {
    if (!sci) return null;
    let s = sci.trim();
    // Handle "Name1 / Name2" — take first
    if (s.includes('/')) s = s.split('/')[0].trim();
    // Normalize unicode × and ASCII "x" between words
    s = s.replace(/×\s*/g, '× ');
    s = s.replace(/\s+[xX]\s+/g, ' × ');
    // Uppercase
    s = s.toUpperCase();
    // Remove cultivar notation 'NAME' or "NAME" (also GROUP/GROEP suffixes)
    s = s.replace(/\s*'[^']*'(\s*(GROUP|GROEP))?/g, '').trim();
    s = s.replace(/\s*"[^"]*"(\s*(GROUP|GROEP))?/g, '').trim();
    // Split and extract binomial only
    const STOP = new Set(['SUBSP.', 'VAR.', 'F.', 'CV.', 'SUBG.', 'SECT.', 'SER.', 'NOTHOSUBSP.', 'NOTHOVAR.']);
    const words = s.split(/\s+/).filter(Boolean);
    const result = [];
    for (const w of words) {
        if (STOP.has(w)) break;
        result.push(w);
        // Standard binomial: 2 words; hybrid binomial: genus + × + epithet = 3 words
        if (result.length >= 2 && result[1] !== '×') break;
        if (result.length >= 3) break;
    }
    const binomial = result.join(' ').trim();
    return binomial.includes(' ') ? binomial : null; // need at least genus + epithet
}

function normalizeDutch(s) {
    if (!s) return null;
    return s.trim().replace(/\s+/g, ' ') || null;
}

// ─── Wikipedia parser ─────────────────────────────────────────────────────────

function parseWikipedia(html) {
    const entries = [];
    // Tables of boomsoorten have rows with 3 cells: Dutch name | Scientific name | Voorkomen
    const tableRe = /<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
    const rowRe   = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRe  = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

    let tableMatch;
    while ((tableMatch = tableRe.exec(html)) !== null) {
        const tableHtml = tableMatch[1];
        let rowMatch;
        while ((rowMatch = rowRe.exec(tableHtml)) !== null) {
            const rowHtml = rowMatch[1];
            const cells = [];
            let cellMatch;
            while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
                const raw = cellMatch[1]
                    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                cells.push(raw);
            }
            // Table has two row formats:
            //   4 cells: [family taxonomy] [Dutch name] [Scientific name] [Voorkomen]
            //            (first entry per family group, family cell uses rowspan)
            //   3 cells: [Dutch name] [Scientific name] [Voorkomen]
            //            (subsequent entries in the same family group)
            let dutch, scientific, voorkomen;
            if (cells.length >= 4) {
                dutch      = normalizeDutch(cells[1]);
                scientific = normalizeDutch(cells[2]);
                voorkomen  = normalizeDutch(cells[3]);
            } else if (cells.length === 3) {
                dutch      = normalizeDutch(cells[0]);
                scientific = normalizeDutch(cells[1]);
                voorkomen  = normalizeDutch(cells[2]);
            } else {
                continue;
            }

            if (!dutch || !scientific) continue;
            // Skip header rows
            if (/^(Nederlandse naam|Soort|Naam|Boomsoort|Familie)/i.test(dutch)) continue;

            const binomial = toBinomial(scientific);
            if (!binomial) continue;

            // Skip junk: Dutch name equals scientific name (no Dutch name assigned)
            const dutchLow = dutch.toLowerCase();
            const sciLow   = binomial.toLowerCase().replace(' × ', ' x ').replace('×', 'x');
            if (dutchLow === binomial.toLowerCase()) continue;
            // Also skip if Dutch name is just the genus word
            if (dutchLow === binomial.toLowerCase().split(' ')[0]) continue;

            // Normalize voorkomen to canonical values
            let voork = null;
            if (voorkomen) {
                const v = voorkomen.toLowerCase();
                if (v.includes('inheems') && v.includes('niet')) {
                    voork = voorkomen.includes('*') ? 'Niet inheems*' : 'Niet inheems';
                } else if (v.includes('inheems')) {
                    voork = 'Inheems';
                }
            }

            entries.push({ dutch, binomial, voorkomen: voork, raw_scientific: scientific });
        }
    }
    return entries;
}

// ─── Bomenbieb parser ─────────────────────────────────────────────────────────

function parseBomenbieb(html) {
    // Actual structure (server-rendered via Search & Filter Pro shortcode):
    // <p class="h5 card-title mb-0" ...>DUTCH NAME</p>
    // <p class="card-text ..."><small class="text-muted"><i>SCIENTIFIC NAME</i></small></p>
    //
    // HTML entities: &#8216; = ' (left quote), &#8217; = ' (right quote)
    const entries = [];

    // Match each card block between card-body divs
    const cardRe = /<div class="card-body">([\s\S]*?)<\/div>/gi;
    let card;
    while ((card = cardRe.exec(html)) !== null) {
        const block = card[1];

        const titleMatch = block.match(/<p[^>]*class="h5 card-title[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
        if (!titleMatch) continue;
        const dutchRaw = titleMatch[1]
            .replace(/&#8216;/g, '‘').replace(/&#8217;/g, '’')
            .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
            .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const dutch = normalizeDutch(dutchRaw);
        if (!dutch || dutch.length < 3) continue;

        const sciMatch = block.match(/<i[^>]*>([\s\S]*?)<\/i>/i);
        if (!sciMatch) continue;
        const rawSci = sciMatch[1].replace(/&#8216;/g, "'").replace(/&#8217;/g, "'")
            .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (!rawSci) continue;

        // Skip cultivar entries: scientific name contains single quote (incl. Unicode curly quotes)
        if (rawSci.includes("'") || rawSci.includes('‘') || rawSci.includes('’')) continue;
        // Dutch name with cultivar quote → also skip
        if (dutch.includes('‘') || dutch.includes('’')) continue;

        const binomial = toBinomial(rawSci);
        if (!binomial) continue;

        entries.push({ dutch, binomial, raw_scientific: rawSci });
    }

    return entries;
}

// ─── Bomenbieb full fetch ─────────────────────────────────────────────────────

async function fetchBomenbieb() {
    const BASE = 'https://bomenbieb.nl/alle-boomsoorten/';
    const allEntries = [];
    const seen = new Set();

    function addEntries(entries) {
        for (const e of entries) {
            const key = e.binomial + '|' + e.dutch.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                allEntries.push(e);
            }
        }
    }

    process.stderr.write('Fetching Bomenbieb page 1...\n');
    const page1 = await fetchHtml(BASE);
    let parsed = parseBomenbieb(page1);
    if (parsed.length === 0) parsed = parseBomenbiebGrid(page1);
    process.stderr.write(`  Page 1: ${parsed.length} entries\n`);
    addEntries(parsed);

    // Determine total count from "X van Y boomsoorten" text
    // X = number shown on this page (40), Y = total entries (497)
    const totalMatch = page1.match(/(\d+) van (\d+) boomsoorten/);
    const pageSize = totalMatch ? parseInt(totalMatch[1], 10) : 40;
    const total    = totalMatch ? parseInt(totalMatch[2], 10) : 497;
    const maxPage  = Math.ceil(total / pageSize);
    process.stderr.write(`  Total: ${total} entries, page size ${pageSize}, ${maxPage} pages\n`);

    for (let p = 2; p <= maxPage; p++) {
        process.stderr.write(`Fetching Bomenbieb page ${p}/${maxPage}...\n`);
        try {
            const html = await fetchHtml(`${BASE}?sf_paged=${p}`);
            const pe = parseBomenbieb(html);
            process.stderr.write(`  Page ${p}: ${pe.length} entries\n`);
            addEntries(pe);
            await new Promise(r => setTimeout(r, 300));
        } catch (err) {
            process.stderr.write(`  Page ${p}: ERROR ${err.message}\n`);
        }
    }

    return allEntries;
}

// ─── Database vote reader ─────────────────────────────────────────────────────

const SPELLING_NORMS = [
    [/cypres/g,         'cipres'],
    [/bastaard/g,       'basterd'],
    [/paardekastanje/g, 'paardenkastanje'],
    [/hymalaya/g,       'himalaya'],
    [/tataarse/g,       'tartaarse'],
    [/pyreneese/g,      'pyrenese'],
    [/-/g,              ' '],
    [/\s+/g,            ' '],
];

function normalize(s) { return s.trim().toLowerCase().replace(/\s+/g, ' '); }
function normalizeKey(s) {
    let n = normalize(s);
    for (const [pat, rep] of SPELLING_NORMS) n = n.replace(pat, rep);
    return n.trim();
}
function toDisplayCase(s) {
    if (s === s.toUpperCase()) return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    return s;
}
function isJunk(nameLow, spLow) {
    if (nameLow === spLow) return true;
    if (nameLow === spLow.split(' ')[0]) return true;
    return false;
}

async function buildDatabaseVotes(SQL) {
    const dbFiles = (await fs.readdir(DATA_DIR))
        .filter(f => f.endsWith('.db') && !f.startsWith('vernacular'))
        .map(f => path.join(DATA_DIR, f));

    const votes = new Map();

    for (const file of dbFiles) {
        const city = path.basename(file, '.db');
        process.stderr.write(`Reading db: ${city}...\n`);
        const buf = await fs.readFile(file);
        const db  = new SQL.Database(buf);

        const result = db.exec(`
            SELECT species_binomial, name_indigenous, COUNT(*) AS cnt
            FROM trees
            WHERE name_indigenous IS NOT NULL AND name_indigenous != ''
              AND species_binomial IS NOT NULL AND species_binomial != ''
              AND name_indigenous NOT LIKE '%,%'
            GROUP BY species_binomial, name_indigenous
        `);

        if (result.length > 0) {
            for (const [spRaw, nameRaw, cnt] of result[0].values) {
                const spLow   = normalize(spRaw);
                const nameLow = normalize(nameRaw);
                if (isJunk(nameLow, spLow)) continue;

                if (!votes.has(spLow)) {
                    votes.set(spLow, { canonical: spRaw, genus: spLow.split(' ')[0], names: new Map() });
                }
                const entry   = votes.get(spLow);
                const nameKey = normalizeKey(nameRaw);
                if (!entry.names.has(nameKey)) {
                    entry.names.set(nameKey, { count: 0, displays: new Map() });
                }
                const v = entry.names.get(nameKey);
                v.count += cnt;
                const disp = toDisplayCase(nameRaw);
                v.displays.set(disp, (v.displays.get(disp) || 0) + cnt);
            }
        }
        db.close();
    }

    // Genus placeholder detection
    const topByGenus = new Map();
    for (const [, { genus, names }] of votes) {
        if (names.size === 0) continue;
        const [topKey] = [...names.entries()].sort((a, b) => b[1].count - a[1].count)[0];
        if (!topKey.includes(' ')) {
            if (!topByGenus.has(genus)) topByGenus.set(genus, new Map());
            const m = topByGenus.get(genus);
            m.set(topKey, (m.get(topKey) || 0) + 1);
        }
    }
    const genusPlaceholders = new Set();
    for (const [, m] of topByGenus) {
        for (const [key, cnt] of m) {
            if (cnt >= 3) genusPlaceholders.add(key);
        }
    }
    process.stderr.write(`Genus placeholders (${genusPlaceholders.size}): ${[...genusPlaceholders].sort().join(', ')}\n`);

    // Resolve votes to winners
    const resolved = new Map(); // spLow → { canonical, name_vernacular, name_vernacular_alt }

    for (const [spLow, { canonical, names }] of votes) {
        if (names.size === 0) continue;

        const candidates = [...names.entries()].map(([nameKey, v]) => ({
            nameKey,
            display: [...v.displays.entries()].sort((a, b) => b[1] - a[1])[0][0],
            count: v.count,
        }));
        const lows = candidates.map(c => normalize(c.display));

        const ranked = candidates.map((c, i) => ({
            ...c,
            specificity: lows.filter((other, j) =>
                j !== i && !other.includes(' ') &&
                genusPlaceholders.has(normalizeKey(other)) &&
                lows[i].endsWith(other)
            ).length,
        })).sort((a, b) => {
            if (b.specificity !== a.specificity) return b.specificity - a.specificity;
            if (b.count !== a.count) return b.count - a.count;
            return b.display.length - a.display.length;
        });

        const winner = ranked[0];
        const wLow   = normalize(winner.display);
        const alt    = ranked.find((c, i) => {
            if (i === 0) return false;
            if (c.count / winner.count < 0.25) return false;
            if (c.nameKey === winner.nameKey) return false;
            const cLow = normalize(c.display);
            return !wLow.endsWith(cLow) && !cLow.endsWith(wLow);
        });

        resolved.set(spLow, {
            canonical,
            name_vernacular:     winner.display,
            name_vernacular_alt: alt?.display ?? null,
        });
    }

    return resolved;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    await fs.mkdir(SOURCES_DIR, { recursive: true });

    // Fetch / load web sources
    let wikiEntries, bomenbiebEntries;

    const wikiCache    = path.join(SOURCES_DIR, 'wikipedia.json');
    const bomenCache   = path.join(SOURCES_DIR, 'bomenbieb.json');

    if (process.argv.includes('--no-cache') || !(await fs.access(wikiCache).then(() => true, () => false))) {
        process.stderr.write('\nFetching Wikipedia...\n');
        const html = await fetchHtml('https://nl.wikipedia.org/wiki/Lijst_van_boomsoorten_in_Nederland');
        wikiEntries = parseWikipedia(html);
        await fs.writeFile(wikiCache, JSON.stringify(wikiEntries, null, 2));
        process.stderr.write(`Wikipedia: ${wikiEntries.length} entries\n`);
    } else {
        wikiEntries = JSON.parse(await fs.readFile(wikiCache, 'utf8'));
        process.stderr.write(`Wikipedia (cached): ${wikiEntries.length} entries\n`);
    }

    if (process.argv.includes('--no-cache') || !(await fs.access(bomenCache).then(() => true, () => false))) {
        process.stderr.write('\nFetching Bomenbieb...\n');
        bomenbiebEntries = await fetchBomenbieb();
        await fs.writeFile(bomenCache, JSON.stringify(bomenbiebEntries, null, 2));
        process.stderr.write(`Bomenbieb: ${bomenbiebEntries.length} species-level entries\n`);
    } else {
        bomenbiebEntries = JSON.parse(await fs.readFile(bomenCache, 'utf8'));
        process.stderr.write(`Bomenbieb (cached): ${bomenbiebEntries.length} entries\n`);
    }

    // Build lookup maps keyed by uppercase binomial
    const wikiMap      = new Map(); // binomial → { dutch, voorkomen }
    const bomenbiebMap = new Map(); // binomial → dutch

    for (const e of wikiEntries) {
        wikiMap.set(e.binomial, { dutch: e.dutch, voorkomen: e.voorkomen });
    }
    for (const e of bomenbiebEntries) {
        if (!bomenbiebMap.has(e.binomial)) {
            bomenbiebMap.set(e.binomial, e.dutch);
        }
    }

    // Build database votes
    process.stderr.write('\nBuilding database votes...\n');
    const SQL      = await initSqlJs();
    const dbVotes  = await buildDatabaseVotes(SQL);

    // Collect all unique binomials across all sources
    const allBinomials = new Set([
        ...wikiMap.keys(),
        ...bomenbiebMap.keys(),
        ...[...dbVotes.values()].map(v => v.canonical.toUpperCase()),
    ]);

    // Merge with priority: wikipedia > bomenbieb > database
    const rows = [];
    let wikiWins = 0, bomenbiebWins = 0, dbWins = 0;

    // Normalise a binomial to uppercase for map lookup
    const normKey = s => s.toUpperCase().replace(/\s+/g, ' ').trim();

    for (const bin of allBinomials) {
        const key = normKey(bin);

        const wiki     = wikiMap.get(key);
        const bomen    = bomenbiebMap.get(key);
        // DB vote key is lowercase
        const dbEntry  = dbVotes.get(key.toLowerCase());

        let name_vernacular, name_vernacular_alt, source;

        if (wiki) {
            name_vernacular     = wiki.dutch;
            name_vernacular_alt = bomen && normalize(bomen) !== normalize(wiki.dutch) ? bomen : (dbEntry?.name_vernacular_alt ?? null);
            source              = 'wikipedia';
            wikiWins++;
        } else if (bomen) {
            name_vernacular     = bomen;
            name_vernacular_alt = dbEntry?.name_vernacular_alt ?? null;
            source              = 'bomenbieb';
            bomenbiebWins++;
        } else if (dbEntry) {
            name_vernacular     = dbEntry.name_vernacular;
            name_vernacular_alt = dbEntry.name_vernacular_alt ?? null;
            source              = 'databases';
            dbWins++;
        } else {
            continue;
        }

        // Canonical form: use db canonical if available (preserves original database capitalisation)
        const canonical = dbEntry?.canonical ?? bin;

        rows.push({ canonical, name_vernacular, name_vernacular_alt, source });
    }

    process.stderr.write(`\nMerge results:\n`);
    process.stderr.write(`  Wikipedia wins:  ${wikiWins}\n`);
    process.stderr.write(`  Bomenbieb wins:  ${bomenbiebWins}\n`);
    process.stderr.write(`  Database wins:   ${dbWins}\n`);
    process.stderr.write(`  Total entries:   ${rows.length}\n\n`);

    // Write output database
    const outDb = new SQL.Database();
    outDb.run(`
        CREATE TABLE vernacular_nl (
            species_binomial    TEXT PRIMARY KEY,
            name_vernacular     TEXT NOT NULL,
            name_vernacular_alt TEXT,
            source              TEXT
        )
    `);

    const stmt = outDb.prepare(`INSERT INTO vernacular_nl VALUES (?, ?, ?, ?)`);
    for (const r of rows) {
        stmt.run([
            r.canonical,
            r.name_vernacular,
            r.name_vernacular_alt ?? null,
            r.source,
        ]);
    }
    stmt.free();

    await fs.writeFile(OUT_FILE, Buffer.from(outDb.export()));
    outDb.close();

    process.stderr.write(`Wrote ${rows.length} entries to ${OUT_FILE}\n`);

    // Show Wikipedia/Bomenbieb conflicts
    let conflicts = 0;
    for (const [bin, wikiData] of wikiMap) {
        const bomen = bomenbiebMap.get(bin);
        if (bomen && normalize(bomen) !== normalize(wikiData.dutch)) {
            if (conflicts === 0) process.stderr.write('\nWiki/Bomenbieb name conflicts (wiki wins):\n');
            process.stderr.write(`  ${bin}: wiki="${wikiData.dutch}" | bomenbieb="${bomen}"\n`);
            conflicts++;
        }
    }
    if (conflicts > 0) process.stderr.write(`  (${conflicts} conflicts)\n`);
}

main().catch(err => {
    process.stderr.write(`Error: ${err.stack}\n`);
    process.exit(1);
});
