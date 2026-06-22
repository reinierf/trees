#!/usr/bin/env node
/**
 * Fetch vernacular names for genus-only species_binomial values
 * (single-word entries such as MAGNOLIA, QUERCUS, PRUNUS).
 *
 * Uses rank=genus for the iNat lookup. Much faster than a full fetch run —
 * only ~65 real genera out of the ~103 genus-only values; the rest fail
 * gracefully and are marked inat_id: null.
 *
 * Usage: node tools/vernacular/base/fetch-genera.js [--no-cache]
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';
import { CITIES } from '../../../config.js';

const DIR      = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(DIR, '..', '..', '..', 'data');
const REG_PATH = path.join(DIR, '..', '..', '..', 'registry.json');
const LOG_PATH = path.join(DIR, '..', '..', '..', 'registry-log.jsonl');
const OUT_FILE = path.join(DATA_DIR, 'vernacular-base.db');

const API     = 'https://api.inaturalist.org/v1';
const RATE_MS = 700;
const LANGS   = ['nl', 'en', 'de', 'fr'];

const DB_PATHS = Object.values(CITIES)
    .map(c => path.join(DATA_DIR, c.outputFile.sqlite))
    .filter(p => existsSync(p));

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJson(url, retries = 3) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        const res = await fetch(url);
        if (res.ok) return res.json();
        if (res.status === 429 && attempt < retries) {
            const wait = 5000 * 2 ** attempt; // 5s, 10s, 20s
            process.stderr.write(`  429 rate limit, waiting ${wait / 1000}s…\n`);
            await sleep(wait);
            continue;
        }
        throw new Error(`HTTP ${res.status}: ${url}`);
    }
}

function toProperCase(s) {
    return s[0].toUpperCase() + s.slice(1).toLowerCase();
}

function hasNames(v) { return v && LANGS.some(l => v[l]); }

async function getGenusOnly() {
    const SQL     = await initSqlJs();
    const genera  = new Set();
    for (const dbPath of DB_PATHS) {
        const db = new SQL.Database(await fs.readFile(dbPath));
        const res = db.exec(
            `SELECT DISTINCT species_binomial FROM trees
             WHERE species_binomial IS NOT NULL AND species_binomial NOT LIKE '% %'`
        );
        res[0]?.values.forEach(([s]) => genera.add(s));
        db.close();
    }
    return [...genera].sort();
}

async function saveRegistry(registry) {
    const sorted = { _genusCorrections: {} };
    for (const k of Object.keys(registry._genusCorrections ?? {}).sort())
        sorted._genusCorrections[k] = registry._genusCorrections[k];
    for (const k of Object.keys(registry).filter(k => !k.startsWith('_')).sort()) {
        const { inat_id, vernacular, aliases, ...rest } = registry[k];
        sorted[k] = {
            ...(inat_id !== undefined   ? { inat_id }                        : {}),
            ...(vernacular !== undefined ? { vernacular }                     : {}),
            ...(aliases?.length         ? { aliases: [...aliases].sort() }   : {}),
            ...rest,
        };
    }
    await fs.writeFile(REG_PATH, JSON.stringify(sorted, null, 2) + '\n');
}

async function main() {
    const noCache = process.argv.includes('--no-cache');

    const registry = existsSync(REG_PATH)
        ? JSON.parse(await fs.readFile(REG_PATH, 'utf8'))
        : { _genusCorrections: {} };
    let registryDirty = false;

    const all  = await getGenusOnly();
    const todo = all.filter(raw => {
        const entry = registry[raw];
        if (!entry) return true;
        if (entry.genus_checked && !entry.inat_id) return noCache; // tried as genus, not found
        if (!entry.inat_id) return true;             // stub or species-lookup null → retry as genus
        if (noCache) return true;
        return !hasNames(entry.vernacular);
    });
    process.stderr.write(`${all.length} genus-only values — ${todo.length} to fetch\n`);

    let fetched = 0, notFound = 0, errors = 0;

    for (const raw of todo) {
        const name = toProperCase(raw);
        let entry  = registry[raw];
        let taxonId = entry?.inat_id ?? null;

        if (!taxonId) {
            await sleep(RATE_MS);
            let taxon = null;
            try {
                const data  = await fetchJson(`${API}/taxa?q=${encodeURIComponent(name)}&rank=genus&per_page=5`);
                const lower = name.toLowerCase();
                taxon = data.results.find(t => t.name.toLowerCase() === lower) ?? null;
            } catch (e) {
                process.stderr.write(`  ERROR resolving ${name}: ${e.message}\n`);
                errors++;
                continue;
            }

            if (!taxon) {
                process.stderr.write(`  NOT FOUND: ${name}\n`);
                if (!entry) { registry[raw] = {}; entry = registry[raw]; }
                entry.inat_id = null;       // explicit null = tried as genus, not on iNat
                entry.genus_checked = true; // prevents re-fetching on subsequent runs
                registryDirty = true;
                notFound++;
                continue;
            }

            taxonId = taxon.id;
            if (!entry) {
                registry[raw] = { inat_id: taxonId };
                entry = registry[raw];
            } else {
                entry.inat_id = taxonId;
            }
            registryDirty = true;
            await fs.appendFile(LOG_PATH,
                JSON.stringify({ date: new Date().toISOString().slice(0, 10), action: 'add-genus', binomial: raw, inat_id: taxonId }) + '\n'
            );
        }

        await sleep(RATE_MS);
        try {
            const data  = await fetchJson(`${API}/taxa/${taxonId}?all_names=true`);
            const names = {};
            for (const { locale, name } of data.results[0]?.names ?? [])
                if (LANGS.includes(locale) && !names[locale]) names[locale] = name;
            entry.vernacular = names;
            registryDirty = true;
            fetched++;
            process.stderr.write(`  ${raw}: ${Object.entries(names).map(([l,n])=>`${l}=${n}`).join(', ') || '(no names)'}\n`);
        } catch (e) {
            process.stderr.write(`  ERROR fetching names for ${name}: ${e.message}\n`);
            errors++;
        }
    }

    if (registryDirty) await saveRegistry(registry);
    process.stderr.write(`\nDone: ${fetched} fetched, ${notFound} not found, ${errors} errors\n`);

    // Rebuild vernacular-base.db
    const SQL   = await initSqlJs();
    const outDb = new SQL.Database();
    outDb.run(`CREATE TABLE vernacular_base (
        species_binomial TEXT PRIMARY KEY, inat_id INTEGER,
        nl TEXT, en TEXT, de TEXT, fr TEXT
    )`);
    const stmt = outDb.prepare('INSERT OR REPLACE INTO vernacular_base VALUES (?,?,?,?,?,?)');
    let rows = 0;
    for (const [k, v] of Object.entries(registry)) {
        if (k.startsWith('_')) continue;
        if (v.inat_id == null && !hasNames(v.vernacular)) continue;
        stmt.run([k, v.inat_id ?? null, v.vernacular?.nl ?? null, v.vernacular?.en ?? null,
                  v.vernacular?.de ?? null, v.vernacular?.fr ?? null]);
        rows++;
    }
    stmt.free();
    await fs.writeFile(OUT_FILE, Buffer.from(outDb.export()));
    outDb.close();
    process.stderr.write(`Rebuilt vernacular-base.db: ${rows} entries\n`);
}

main().catch(err => { process.stderr.write(`Error: ${err.stack}\n`); process.exit(1); });
