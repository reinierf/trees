#!/usr/bin/env node
/**
 * Flags species that fail to resolve to a known binomial at all — i.e.
 * lib/species.js falls back to the literal (uppercased) candidate because
 * nothing in registry.json matched it, even fuzzily — so a human can add a
 * registry.json entry (alias or _genusCorrections) before the data goes live.
 *
 * Unlike validate-pipeline.js / patch-binomials.js --dry, which only surface
 * species whose resolution *changes* relative to what's already stored (and
 * are therefore empty right after a fresh fetch, since the stored value
 * already reflects the current pipeline), this re-derives resolution from
 * scratch for every distinct species in the target city/cities, so newly
 * unresolved species show up even though nothing has "changed" yet.
 *
 * Usage:
 *   node tools/validate-species.js --city rotterdam
 *   node tools/validate-species.js --city rotterdam,arnhem
 *   node tools/validate-species.js              # all cities
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';
import { CITIES } from '../config.js';
import { processSpeciesTagged } from '../lib/species.js';

const DIR      = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(DIR, '..', 'data');

function parseArgs(argv) {
    const args = { city: null };
    for (let i = 0; i < argv.length; i++)
        if (argv[i] === '--city') args.city = argv[++i];
    return args;
}

// Returns { city, total, unresolved } where unresolved is a Map of
// candidate binomial → first raw species value that produced it.
async function unresolvedForCity(city, SQL) {
    const dbPath = path.join(DATA_DIR, city.outputFile.sqlite);
    if (!existsSync(dbPath)) return null;

    const db  = new SQL.Database(await fs.readFile(dbPath));
    const res = db.exec('SELECT DISTINCT species FROM trees WHERE species IS NOT NULL');
    db.close();

    const rows = res[0]?.values ?? [];
    const unresolved = new Map();

    for (const [raw] of rows) {
        const tagged = processSpeciesTagged(raw);
        if (tagged.resolvedBy !== 'as-is') continue; // only true resolution failures
        if (!unresolved.has(tagged.species_binomial)) unresolved.set(tagged.species_binomial, raw);
    }

    return { city: city.name, total: rows.length, unresolved };
}

async function main() {
    const args   = parseArgs(process.argv.slice(2));
    const cities = args.city
        ? args.city.split(',').map(n => CITIES[n.trim()]).filter(Boolean)
        : Object.values(CITIES);

    const SQL = await initSqlJs();
    const lines = [];
    let totalUnresolved = 0;

    for (const city of cities) {
        const r = await unresolvedForCity(city, SQL);
        if (!r) { process.stderr.write(`[${city.name}] skipped (no DB)\n`); continue; }

        if (r.unresolved.size === 0) {
            process.stderr.write(`[${r.city}] ${r.total} unique species — all resolve\n`);
            continue;
        }

        process.stderr.write(`\n[${r.city}] ${r.unresolved.size} unresolved species (of ${r.total} unique):\n`);
        for (const [candidate, raw] of r.unresolved) {
            process.stderr.write(`  ${candidate}  (raw: "${raw}")\n`);
            lines.push(`  ${candidate}  (raw: "${raw}")`);
        }
        totalUnresolved += r.unresolved.size;
    }

    if (totalUnresolved === 0) {
        process.stderr.write('\nNo unresolved species found.\n');
        return;
    }

    process.stderr.write(
        `\n${totalUnresolved} species need a registry.json entry (alias or _genusCorrections) ` +
        'before this data goes live.\nAdd them, then run: node patch-binomials.js\n'
    );
    process.stdout.write(lines.join('\n') + '\n');
}

main().catch(err => { process.stderr.write(`Error: ${err.stack}\n`); process.exit(1); });
