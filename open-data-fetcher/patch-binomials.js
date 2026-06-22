#!/usr/bin/env node
/**
 * Re-resolves species_binomial and species_cultivar for all city SQLite databases
 * using the current registry.json and lib/species.js pipeline, without re-importing
 * from source APIs.
 *
 * Reads the stored `species` field (always the raw source value), runs it through
 * processSpecies(), and updates any rows where the result differs. Trees whose
 * species processSpecies() would now drop (dropTerms match) are left in place —
 * a full re-import is required to remove them.
 *
 * Usage:
 *   node patch-binomials.js
 *   node patch-binomials.js --city amsterdam,rotterdam
 *   node patch-binomials.js --dry   (report changes without writing)
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';
import { CITIES } from './config.js';
import { processSpecies, getFuzzyLog, clearFuzzyLog } from './lib/species.js';

const DIR      = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(DIR, 'data');

function parseArgs(argv) {
    const args = { city: null, dry: false };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--city') args.city = argv[++i];
        if (argv[i] === '--dry')  args.dry  = true;
    }
    return args;
}

async function patchCity(city, dry, SQL) {
    const dbPath = path.join(DATA_DIR, city.outputFile.sqlite);
    if (!existsSync(dbPath)) {
        process.stderr.write(`[${city.name}] skipped (no DB found)\n`);
        return 0;
    }

    const db   = new SQL.Database(await fs.readFile(dbPath));
    const res  = db.exec('SELECT rowid, species, species_binomial, species_cultivar FROM trees WHERE species IS NOT NULL');
    const rows = res[0]?.values ?? [];

    const stmt = dry ? null : db.prepare(
        'UPDATE trees SET species_binomial = ?, species_cultivar = ? WHERE rowid = ?'
    );

    let changed = 0;
    for (const [rowid, species, oldBinomial, oldCultivar] of rows) {
        const result      = processSpecies(species);
        const newBinomial = result?.species_binomial ?? null;
        const newCultivar = result?.species_cultivar ?? null;
        if (newBinomial === oldBinomial && newCultivar === oldCultivar) continue;

        changed++;
        if (dry) {
            process.stdout.write(`  ${species}\n    binomial:  ${oldBinomial} → ${newBinomial}\n`);
            if (oldCultivar !== newCultivar)
                process.stdout.write(`    cultivar:  ${oldCultivar} → ${newCultivar}\n`);
        } else {
            stmt.run([newBinomial, newCultivar, rowid]);
        }
    }

    stmt?.free();
    if (!dry && changed > 0) await fs.writeFile(dbPath, Buffer.from(db.export()));
    db.close();

    const verb = dry ? 'would update' : 'updated';
    process.stderr.write(`[${city.name}] ${verb} ${changed} / ${rows.length} rows\n`);
    return changed;
}

async function main() {
    const args   = parseArgs(process.argv.slice(2));
    const cities = args.city
        ? args.city.split(',').map(n => CITIES[n.trim()]).filter(Boolean)
        : Object.values(CITIES);

    const SQL = await initSqlJs();
    let total = 0;
    for (const city of cities) total += await patchCity(city, args.dry, SQL);
    process.stderr.write(`Total: ${total} rows ${args.dry ? 'would be ' : ''}updated\n`);

    const fuzzy = getFuzzyLog();
    if (fuzzy.length > 0) {
        process.stderr.write(`\nFuzzy resolutions (${fuzzy.length}) — consider adding to registry.json:\n`);
        const seen = new Set();
        for (const f of fuzzy) {
            const key = `${f.corrected} → ${f.matched}`;
            if (seen.has(key)) continue;
            seen.add(key);
            process.stderr.write(`  ${f.corrected} → ${f.matched}\n`);
        }
    }
}

main().catch(err => { process.stderr.write(`Error: ${err.stack}\n`); process.exit(1); });
