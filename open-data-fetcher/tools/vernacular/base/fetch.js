#!/usr/bin/env node
/**
 * Fetch vernacular names for all unique species from the iNaturalist API.
 * Writes vernacular-base.db: one row per species, one column per language.
 *
 * Two API calls per species:
 *   1. GET /taxa?q={name}&rank=species  — resolve scientific name → taxon ID
 *   2. GET /taxa/{id}?all_names=true    — fetch all vernacular names at once
 *
 * Results are cached in cache.json so the script is safe to re-run after
 * interruption. Skipped: species confirmed absent from iNaturalist (null).
 * Re-fetched: species with a taxon ID but no vernacular names yet.
 *
 * Usage: node tools/vernacular/base/fetch.js [--no-cache]
 * Runtime: ~23 min for 1000 species (700 ms × 2 calls each)
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

const DIR      = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(DIR, '..', '..', '..', 'data');
const CACHE    = path.join(DIR, 'cache.json');
const OUT_FILE = path.join(DATA_DIR, 'vernacular-base.db');

const API      = 'https://api.inaturalist.org/v1';
const RATE_MS  = 700;   // ~85 req/min, safely under the 100/min unauthenticated cap

const LANGS = new Set(['nl', 'en', 'de', 'fr']);

const DB_PATHS = ['rotterdam', 'amsterdam', 'den-haag', 'groningen']
    .map(c => path.join(DATA_DIR, `${c}.db`));

// "QUERCUS ROBUR" → "Quercus robur"  (iNaturalist expects proper scientific case)
function toProperCase(binomial) {
    const parts = binomial.toLowerCase().split(' ');
    parts[0] = parts[0][0].toUpperCase() + parts[0].slice(1);
    return parts.join(' ');
}

async function getDistinctSpecies() {
    const SQL     = await initSqlJs();
    const species = new Set();
    for (const dbPath of DB_PATHS) {
        const buf = await fs.readFile(dbPath);
        const db  = new SQL.Database(buf);
        const res = db.exec('SELECT DISTINCT species_binomial FROM trees WHERE species_binomial IS NOT NULL');
        res[0]?.values.forEach(([s]) => species.add(s));
        db.close();
    }
    return [...species].sort();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.json();
}

// Step 1: resolve scientific name → iNaturalist taxon (prefers exact name match)
async function resolveTaxon(name) {
    const data = await fetchJson(`${API}/taxa?q=${encodeURIComponent(name)}&rank=species&per_page=5`);
    const lower = name.toLowerCase();
    return data.results.find(t => t.name.toLowerCase() === lower)
        ?? data.results[0]
        ?? null;
}

// Step 2: fetch all vernacular names for a taxon (first entry per language wins)
async function fetchVernacularNames(taxonId) {
    const data  = await fetchJson(`${API}/taxa/${taxonId}?all_names=true`);
    const names = {};
    for (const { locale, name } of data.results[0]?.names ?? []) {
        if (LANGS.has(locale) && !names[locale]) names[locale] = name;
    }
    return names;
}

async function main() {
    const noCache = process.argv.includes('--no-cache');
    const cache   = (!noCache && existsSync(CACHE))
        ? JSON.parse(await fs.readFile(CACHE, 'utf8'))
        : {};

    const all  = await getDistinctSpecies();
    const hasNames = e => e && (e.nl || e.en || e.de || e.fr);
    const todo = all.filter(s => !(s in cache) || (cache[s] !== null && !hasNames(cache[s])));
    process.stderr.write(`${all.length} species total — ${todo.length} to fetch\n`);

    let fetched = 0, notFound = 0, errors = 0;

    for (const raw of todo) {
        const name = toProperCase(raw);
        await sleep(RATE_MS);

        let taxon;
        try {
            taxon = await resolveTaxon(name);
        } catch (e) {
            process.stderr.write(`  ERROR resolving ${name}: ${e.message}\n`);
            errors++;
            continue;
        }

        if (!taxon) {
            process.stderr.write(`  NOT FOUND: ${name}\n`);
            cache[raw] = null;
            notFound++;
            continue;
        }

        await sleep(RATE_MS);
        const names = await fetchVernacularNames(taxon.id);
        cache[raw] = { id: taxon.id, ...names };
        fetched++;

        if (fetched % 50 === 0) {
            await fs.writeFile(CACHE, JSON.stringify(cache, null, 2));
            process.stderr.write(`  ${fetched} fetched, ${notFound} not found, ${errors} errors\n`);
        }
    }

    await fs.writeFile(CACHE, JSON.stringify(cache, null, 2));
    process.stderr.write(`\nFetch complete: ${fetched} fetched, ${notFound} not found, ${errors} errors\n`);

    // Write SQLite output
    const SQL   = await initSqlJs();
    const outDb = new SQL.Database();
    outDb.run(`
        CREATE TABLE vernacular_base (
            species_binomial  TEXT PRIMARY KEY,
            inat_id           INTEGER,
            nl                TEXT,
            en                TEXT,
            de                TEXT,
            fr                TEXT
        )
    `);

    const stmt = outDb.prepare('INSERT INTO vernacular_base VALUES (?, ?, ?, ?, ?, ?)');
    for (const [binomial, entry] of Object.entries(cache)) {
        if (entry === null) continue;
        stmt.run([binomial, entry.id ?? null, entry.nl ?? null, entry.en ?? null, entry.de ?? null, entry.fr ?? null]);
    }
    stmt.free();

    await fs.writeFile(OUT_FILE, Buffer.from(outDb.export()));
    outDb.close();

    const count = Object.values(cache).filter(v => v !== null).length;
    process.stderr.write(`Wrote ${count} entries to ${OUT_FILE}\n`);
}

main().catch(err => {
    process.stderr.write(`Error: ${err.stack}\n`);
    process.exit(1);
});
