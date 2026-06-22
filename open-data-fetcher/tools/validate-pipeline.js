#!/usr/bin/env node
/**
 * Validation: compares new pipeline output (species.js + registry.json)
 * against species_binomial values currently stored in city databases.
 *
 * Reports three categories:
 *   IMPROVED  — new pipeline produces a better result (was null/abbreviated, now resolved)
 *   CHANGED   — new pipeline produces a different non-null result (needs review)
 *   REGRESSED — new pipeline produces null where DB had a value (needs investigation)
 */
import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';
import { CITIES } from '../config.js';
import { processSpecies, getFuzzyLog } from '../lib/species.js';

const DIR      = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(DIR, '..', 'data');

async function validateCity(city, SQL) {
    const dbPath = path.join(DATA_DIR, city.outputFile.sqlite);
    if (!existsSync(dbPath)) return null;

    const db  = new SQL.Database(await fs.readFile(dbPath));
    const res = db.exec('SELECT species, species_binomial FROM trees WHERE species IS NOT NULL GROUP BY species');
    db.close();

    const rows = res[0]?.values ?? [];
    const improved = [], changed = [], regressed = [];

    for (const [species, oldBinomial] of rows) {
        const result     = processSpecies(species);
        const newBinomial = result?.species_binomial ?? null;
        if (newBinomial === oldBinomial) continue;

        const entry = { species, old: oldBinomial, new: newBinomial };
        if (!oldBinomial && newBinomial)                        improved.push(entry);
        else if (oldBinomial && !newBinomial)                   regressed.push(entry);
        else if (oldBinomial && newBinomial)                    changed.push(entry);
    }

    return { city: city.name, rows: rows.length, improved, changed, regressed };
}

async function main() {
    const SQL     = await initSqlJs();
    const cities  = Object.values(CITIES);
    let totalRows = 0, totalImproved = 0, totalChanged = 0, totalRegressed = 0;

    for (const city of cities) {
        const r = await validateCity(city, SQL);
        if (!r) { process.stderr.write(`[${city.name}] skipped (no DB)\n`); continue; }

        totalRows      += r.rows;
        totalImproved  += r.improved.length;
        totalChanged   += r.changed.length;
        totalRegressed += r.regressed.length;

        if (r.improved.length + r.changed.length + r.regressed.length === 0) {
            process.stderr.write(`[${r.city}] ${r.rows} unique species — all match\n`);
            continue;
        }

        process.stderr.write(`\n[${r.city}] ${r.rows} unique species\n`);
        for (const e of r.improved)
            process.stderr.write(`  IMPROVED   ${e.species}\n             null → ${e.new}\n`);
        for (const e of r.changed)
            process.stderr.write(`  CHANGED    ${e.species}\n             ${e.old} → ${e.new}\n`);
        for (const e of r.regressed)
            process.stderr.write(`  REGRESSED  ${e.species}\n             ${e.old} → null\n`);
    }

    process.stderr.write(`\nSummary: ${totalRows} unique species across all cities\n`);
    process.stderr.write(`  improved:  ${totalImproved}\n`);
    process.stderr.write(`  changed:   ${totalChanged}\n`);
    process.stderr.write(`  regressed: ${totalRegressed}\n`);

    const fuzzy = getFuzzyLog();
    if (fuzzy.length > 0) {
        process.stderr.write(`\nFuzzy resolutions (${fuzzy.length}):\n`);
        for (const f of fuzzy)
            process.stderr.write(`  ${f.candidate} → ${f.matched}\n`);
    }
}

main().catch(err => { process.stderr.write(`Error: ${err.stack}\n`); process.exit(1); });
