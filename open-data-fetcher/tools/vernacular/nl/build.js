#!/usr/bin/env node
/**
 * Build the vernacular-nl.db lookup table from all city databases.
 *
 * Conflict resolution pipeline:
 *   D - Compound entries ("X, Y") excluded from voting
 *   C - Spelling variants collapsed to one vote key; display picks the majority form
 *   A - Genus placeholders detected; specificity only overrides those single-word names
 *   B - Genuine alternative names stored in name_vernacular_alt
 *
 * Usage: node tools/vernacular/nl/build.js
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data');
const OUT_FILE  = path.join(DATA_DIR, 'vernacular-nl.db');

// Class C: applied to the vote key only — display keeps the majority-voted original form.
// Order matters: word substitutions before hyphen stripping, whitespace collapse last.
const SPELLING_NORMS = [
    [/cypres/g,         'cipres'],           // cipres wins by frequency across all datasets
    [/bastaard/g,       'basterd'],
    [/paardekastanje/g, 'paardenkastanje'],
    [/hymalaya/g,       'himalaya'],
    [/tataarse/g,       'tartaarse'],
    [/pyreneese/g,      'pyrenese'],
    [/-/g,              ' '],                // hyphens → spaces so "Sitka-spar" = "Sitkaspar" after collapse
    [/\s+/g,            ' '],               // collapse whitespace after all replacements
];

function normalize(s) {
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeKey(s) {
    let n = normalize(s);
    for (const [pat, rep] of SPELLING_NORMS) n = n.replace(pat, rep);
    return n.trim();
}

function toDisplayCase(s) {
    // "GEWONE ZOMEREIK" → "Gewone zomereik"; mixed-case names kept as-is
    if (s === s.toUpperCase()) return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    return s;
}

function isJunk(nameLow, spLow) {
    if (nameLow === spLow) return true;                   // scientific name reused as Dutch name
    if (nameLow === spLow.split(' ')[0]) return true;     // just the genus word
    return false;
}

async function main() {
    const SQL = await initSqlJs();

    const dbFiles = (await fs.readdir(DATA_DIR))
        .filter(f => f.endsWith('.db') && !f.startsWith('vernacular'))
        .map(f => path.join(DATA_DIR, f));

    if (dbFiles.length === 0) {
        process.stderr.write(`No databases found in ${DATA_DIR}\n`);
        process.exit(1);
    }

    // votes: Map<spLow, { canonical, genus, names: Map<nameKey, { count, displays, sources }> }>
    const votes = new Map();

    for (const file of dbFiles) {
        const city = path.basename(file, '.db');
        process.stderr.write(`Reading ${city}...\n`);

        const buf = await fs.readFile(file);
        const db  = new SQL.Database(buf);

        // Class D: exclude compound entries ("X, Y") — these are multi-name Rotterdam artefacts
        const result = db.exec(`
            SELECT species_binomial, name_indigenous, COUNT(*) AS cnt
            FROM trees
            WHERE name_indigenous  IS NOT NULL AND name_indigenous  != ''
              AND species_binomial IS NOT NULL AND species_binomial != ''
              AND name_indigenous  NOT LIKE '%,%'
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
                const nameKey = normalizeKey(nameRaw);   // Class C: collapse spelling variants

                if (!entry.names.has(nameKey)) {
                    entry.names.set(nameKey, { count: 0, displays: new Map(), sources: new Set() });
                }
                const v = entry.names.get(nameKey);
                v.count += cnt;
                v.sources.add(city);
                // Track display forms separately so the majority form wins
                const disp = toDisplayCase(nameRaw);
                v.displays.set(disp, (v.displays.get(disp) || 0) + cnt);
            }
        }

        db.close();
    }

    // Class A: detect genus placeholder names.
    // A single-word name is a placeholder if it is the top name (by raw count) for >= 3
    // distinct species within the same genus. Specificity only overrides these names.
    const topByGenus = new Map(); // genus → Map<nameKey, speciesCount>

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
    process.stderr.write(`\nGenus placeholders detected (${genusPlaceholders.size}): ${[...genusPlaceholders].sort().join(', ')}\n\n`);

    // Resolve each species
    const rows      = [];
    const withAlt   = [];

    for (const [, { canonical, names }] of votes) {
        if (names.size === 0) continue;

        // Pick the majority display form for each key
        const candidates = [...names.entries()].map(([nameKey, v]) => ({
            nameKey,
            display: [...v.displays.entries()].sort((a, b) => b[1] - a[1])[0][0],
            count:   v.count,
            sources: v.sources,
        }));

        const lows = candidates.map(c => normalize(c.display));

        // Specificity: +1 for each single-word genus placeholder this name ends with
        const ranked = candidates.map((c, i) => ({
            ...c,
            specificity: lows.filter((other, j) =>
                j !== i &&
                !other.includes(' ') &&
                genusPlaceholders.has(normalizeKey(other)) &&
                lows[i].endsWith(other)
            ).length,
        })).sort((a, b) => {
            if (b.specificity !== a.specificity) return b.specificity - a.specificity;
            if (b.count       !== a.count)       return b.count - a.count;
            return b.display.length - a.display.length;
        });

        const winner = ranked[0];
        const wLow   = normalize(winner.display);

        // Class B: find a genuine alt — runner-up with >= 25% votes that is neither a
        // spelling variant (same nameKey) nor in a suffix relationship with the winner
        const alt = ranked.find((c, i) => {
            if (i === 0) return false;
            if (c.count / winner.count < 0.25) return false;
            if (c.nameKey === winner.nameKey) return false;
            const cLow = normalize(c.display);
            return !wLow.endsWith(cLow) && !cLow.endsWith(wLow);
        });

        if (alt) {
            withAlt.push({
                species:      canonical,
                primary:      winner.display, primaryCount: winner.count,
                alt:          alt.display,    altCount:     alt.count,
            });
        }

        rows.push({
            species_binomial:    canonical,
            name_vernacular:     winner.display,
            name_vernacular_alt: alt?.display ?? null,
            occurrences:         winner.count,
            sources:             JSON.stringify([...winner.sources].sort()),
        });
    }

    process.stderr.write(`Entries with alt name (${withAlt.length}):\n`);
    for (const e of withAlt) {
        process.stderr.write(`  ${e.species}: "${e.primary}" (${e.primaryCount}) | alt: "${e.alt}" (${e.altCount})\n`);
    }
    process.stderr.write('\n');

    // Write output database
    const outDb = new SQL.Database();
    outDb.run(`
        CREATE TABLE vernacular_nl (
            species_binomial    TEXT PRIMARY KEY,
            name_vernacular     TEXT NOT NULL,
            name_vernacular_alt TEXT,
            occurrences         INTEGER,
            sources             TEXT
        )
    `);

    const stmt = outDb.prepare(`INSERT INTO vernacular_nl VALUES (?, ?, ?, ?, ?)`);
    for (const r of rows) {
        stmt.run([r.species_binomial, r.name_vernacular, r.name_vernacular_alt ?? null, r.occurrences, r.sources]);
    }
    stmt.free();

    await fs.writeFile(OUT_FILE, Buffer.from(outDb.export()));
    outDb.close();

    process.stderr.write(`Wrote ${rows.length} entries (${withAlt.length} with alt) to ${OUT_FILE}\n`);
}

main().catch(err => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
});
