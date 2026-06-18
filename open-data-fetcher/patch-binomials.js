#!/usr/bin/env node
/**
 * Re-apply binomialCorrections from overrides.js to all city SQLite databases
 * without re-importing from source APIs.
 *
 * Reads the stored `species` field (always the raw source value), re-derives
 * `species_binomial` and `species_cultivar` using current overrides.js, and
 * updates any rows where the result differs. Trees that processSpecies() would
 * now drop entirely (newly-filtered species) are left in place — a full
 * re-import is required to remove them.
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
import { processSpecies } from './lib/species.js';

const DIR      = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(DIR, 'data');
const CACHE    = path.join(DIR, 'tools', 'vernacular', 'base', 'cache.json');

// If a binomial has a ≤2-char epithet (an unresolved abbreviation), either
// resolve it to the iNat canonical name stored in cache, or fall back to
// genus-only. Called after processSpecies has already applied corrections.
function resolveAbbreviated(binomial, cache) {
    if (!binomial) return binomial;
    const parts = binomial.split(' ');
    const isHybrid  = parts[1] === '×';
    const epithetIdx = isHybrid ? 2 : 1;
    if (parts.length <= epithetIdx) return binomial;
    if (parts[epithetIdx].length > 2) return binomial;
    const entry = cache[binomial];
    if (entry?.name) return entry.name.toUpperCase();
    return parts[0]; // genus-only fallback
}

function parseArgs(argv) {
    const args = { city: null, dry: false };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--city') args.city = argv[++i];
        if (argv[i] === '--dry')  args.dry  = true;
    }
    return args;
}

async function patchCity(city, dry, SQL, cache) {
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
        const newBinomial = resolveAbbreviated(result?.species_binomial ?? null, cache);
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

    const SQL   = await initSqlJs();
    const cache = existsSync(CACHE) ? JSON.parse(await fs.readFile(CACHE, 'utf8')) : {};
    let   total = 0;
    for (const city of cities) total += await patchCity(city, args.dry, SQL, cache);
    process.stderr.write(`Total: ${total} rows ${args.dry ? 'would be ' : ''}updated\n`);
}

main().catch(err => { process.stderr.write(`Error: ${err.stack}\n`); process.exit(1); });
