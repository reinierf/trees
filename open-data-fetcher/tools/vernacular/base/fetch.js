#!/usr/bin/env node
/**
 * Fetch vernacular names for all unique species from the iNaturalist API.
 * Writes results into registry.json (as `vernacular: { nl, en, de, fr }`) and
 * rebuilds vernacular-base.db.
 *
 * iNat resolution is two steps:
 *   1. GET /taxa?q={name}[&rank=species]  — species-level search
 *   2. Genus-level fallback if step 1 fails: list all species in the genus,
 *      fuzzy-match the epithet (≤2 edit distance). Only runs when the genus
 *      already appears in the registry (avoids wasted calls for made-up names).
 *
 * New species confirmed by iNat extend registry.json automatically and are
 * logged to registry-log.jsonl.
 *
 * Species not found on iNat are marked with `inat_id: null` (explicit) in the
 * registry and skipped on subsequent runs. Use --no-cache to retry them.
 *
 * Usage: node tools/vernacular/base/fetch.js [--no-cache]
 * Runtime: ~23 min for 1000 species (700 ms × 2 calls each)
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
const RATE_MS = 700; // ~85 req/min, safely under 100/min unauthenticated cap

const LANGS = ['nl', 'en', 'de', 'fr'];

const DB_PATHS = Object.values(CITIES)
    .map(c => path.join(DATA_DIR, c.outputFile.sqlite))
    .filter(p => existsSync(p));

// "QUERCUS ROBUR" → "Quercus robur"
function toProperCase(binomial) {
    const parts = binomial.toLowerCase().split(' ');
    const i     = parts[0] === '×' ? 1 : 0;
    if (parts[i]) parts[i] = parts[i][0].toUpperCase() + parts[i].slice(1);
    return parts.join(' ');
}

// Normalized genus: first word, skipping leading ×
function getGenus(binomial) {
    const words = binomial.split(' ');
    return words[0] === '×' ? (words[1] ?? words[0]) : words[0];
}

function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const row = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
        let prev = i;
        for (let j = 1; j <= n; j++) {
            const val = a[i-1] === b[j-1] ? row[j-1]
                      : 1 + Math.min(prev, row[j], row[j-1]);
            row[j-1] = prev;
            prev = val;
        }
        row[n] = prev;
    }
    return row[n];
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

// Step 1: search by full name. Accepts exact match or closest result within
// edit distance ≤2. Hybrids skip the rank=species restriction.
// Pass rank='genus' for genus-only entries (single-word species_binomial).
async function resolveByName(name, rank = 'species') {
    const isHybrid = name.includes('×');
    const rankParam = rank === 'genus' ? '&rank=genus' : isHybrid ? '' : '&rank=species';
    const data      = await fetchJson(`${API}/taxa?q=${encodeURIComponent(name)}${rankParam}&per_page=5`);
    const lower    = name.toLowerCase();
    const exact    = data.results.find(t => t.name.toLowerCase() === lower);
    if (exact) return exact;
    const best = data.results[0];
    if (best && levenshtein(lower, best.name.toLowerCase()) <= 2) return best;
    return null;
}

// Step 2 (genus-level fallback): list species in the genus on iNat, fuzzy-match
// the epithet. Only runs when the genus already appears in the registry.
async function resolveViaGenus(name, registryKeys) {
    const genus = getGenus(name.toUpperCase());
    const knownGenus = registryKeys.some(k => getGenus(k) === genus);
    if (!knownGenus) return null;

    const genusData = await fetchJson(`${API}/taxa?q=${encodeURIComponent(genus)}&rank=genus&per_page=3`);
    await sleep(RATE_MS);
    const genusTaxon = genusData.results.find(t => t.name.toLowerCase() === genus.toLowerCase());
    if (!genusTaxon) return null;

    const speciesData = await fetchJson(`${API}/taxa?parent_id=${genusTaxon.id}&rank=species&per_page=500`);
    const parts       = name.toLowerCase().split(/\s+/).filter(w => w !== '×');
    const epithet     = parts.slice(1).join(' ');
    if (!epithet) return null;

    let best = null, bestDist = Infinity;
    for (const t of speciesData.results) {
        const te = t.name.toLowerCase().split(/\s+/).slice(1).join(' ');
        const d  = levenshtein(epithet, te);
        if (d <= 2 && d < bestDist) { best = t; bestDist = d; }
    }
    return best;
}

// iNat binomial → uppercase canonical registry key
function canonicalKey(inatName) {
    const upper = inatName.toUpperCase().replace(/\s+/g, ' ').trim();
    const words = upper.split(' ');
    if (words.length === 0) return null;
    if (words.length === 1) return words[0];
    if ((words[1] === '×' || words[1] === 'X') && words[2]) return `${words[0]} × ${words[2]}`;
    return `${words[0]} ${words[1]}`;
}

function hasNames(vernacular) {
    return vernacular && LANGS.some(l => vernacular[l]);
}

async function appendLog(entry) {
    await fs.appendFile(LOG_PATH, JSON.stringify(entry) + '\n');
}

async function saveRegistry(registry) {
    const sorted = { _genusCorrections: {} };
    for (const k of Object.keys(registry._genusCorrections ?? {}).sort())
        sorted._genusCorrections[k] = registry._genusCorrections[k];
    for (const k of Object.keys(registry).filter(k => !k.startsWith('_')).sort()) {
        const { inat_id, vernacular, aliases, ...rest } = registry[k];
        sorted[k] = {
            ...(inat_id !== undefined   ? { inat_id }                         : {}),
            ...(vernacular !== undefined ? { vernacular }                      : {}),
            ...(aliases?.length         ? { aliases: [...aliases].sort() }    : {}),
            ...rest,
        };
    }
    await fs.writeFile(REG_PATH, JSON.stringify(sorted, null, 2) + '\n');
}

async function main() {
    const noCache = process.argv.includes('--no-cache');

    const registry    = existsSync(REG_PATH)
        ? JSON.parse(await fs.readFile(REG_PATH, 'utf8'))
        : { _genusCorrections: {} };
    const registryKeys = Object.keys(registry).filter(k => !k.startsWith('_'));
    let   registryDirty = false;

    const all  = await getDistinctSpecies();
    const todo = all.filter(s => {
        const entry = registry[s];
        if (!entry) return true;                         // unknown species → needs full lookup
        if ('inat_id' in entry && entry.inat_id === null)
            return noCache;                              // previously not found → retry only with --no-cache
        if (!entry.inat_id) return true;                 // stub without inat_id → needs lookup
        return !hasNames(entry.vernacular);              // has inat_id but missing vernacular
    });
    process.stderr.write(`${all.length} species total — ${todo.length} to fetch\n`);

    let fetched = 0, notFound = 0, errors = 0, regAdded = 0;

    for (const raw of todo) {
        const name       = toProperCase(raw);
        const isGenusOnly = !raw.includes(' ');
        let   entry = registry[raw];
        let   taxonId = entry?.inat_id ?? null;

        if (!taxonId) {
            await sleep(RATE_MS);
            let taxon;
            try {
                taxon = await resolveByName(name, isGenusOnly ? 'genus' : 'species');
                if (!taxon && !isGenusOnly) {
                    await sleep(RATE_MS);
                    taxon = await resolveViaGenus(name, registryKeys);
                    if (taxon) process.stderr.write(`  [genus fallback] ${name} → ${taxon.name}\n`);
                }
            } catch (e) {
                process.stderr.write(`  ERROR resolving ${name}: ${e.message}\n`);
                errors++;
                continue;
            }

            if (!taxon) {
                process.stderr.write(`  NOT FOUND: ${name}\n`);
                if (!entry) { registry[raw] = {}; entry = registry[raw]; }
                entry.inat_id = null; // explicit null = "looked up, not on iNat"
                registryDirty = true;
                notFound++;
                continue;
            }

            taxonId = taxon.id;

            // Extend registry entry: add inat_id, and add new canonical if iNat name differs
            const ck = canonicalKey(taxon.name);
            if (!entry) {
                registry[raw] = { inat_id: taxonId };
                entry = registry[raw];
                registryKeys.push(raw);
                registryDirty = true;
                regAdded++;
                await appendLog({ date: new Date().toISOString().slice(0, 10), action: 'add', binomial: raw, inat_id: taxonId, source: 'inat-auto' });
            } else if (!entry.inat_id) {
                entry.inat_id = taxonId;
                registryDirty = true;
                await appendLog({ date: new Date().toISOString().slice(0, 10), action: 'update-inat-id', binomial: raw, inat_id: taxonId, source: 'inat-auto' });
            }
            // If iNat canonical differs from our key, add as a separate entry too
            if (ck && ck !== raw && !registry[ck]) {
                registry[ck] = { inat_id: taxonId };
                registryKeys.push(ck);
                registryDirty = true;
                regAdded++;
                await appendLog({ date: new Date().toISOString().slice(0, 10), action: 'add', binomial: ck, inat_id: taxonId, source: 'inat-auto' });
            }
        }

        await sleep(RATE_MS);
        let vernacular = {};
        try {
            vernacular = await fetchVernacularNames(taxonId);
        } catch (e) {
            process.stderr.write(`  ERROR fetching names for ${name} (id ${taxonId}): ${e.message}\n`);
            errors++;
            continue;
        }

        entry.vernacular = vernacular;
        registryDirty = true;
        fetched++;

        if (fetched % 50 === 0) {
            await saveRegistry(registry);
            process.stderr.write(`  ${fetched} fetched, ${notFound} not found, ${errors} errors, ${regAdded} added to registry\n`);
        }
    }

    if (registryDirty) await saveRegistry(registry);

    process.stderr.write(`\nFetch complete: ${fetched} fetched, ${notFound} not found, ${errors} errors\n`);
    if (regAdded > 0) process.stderr.write(`Registry: ${regAdded} new entries added\n`);

    // Rebuild SQLite output from registry
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

    const stmt = outDb.prepare('INSERT OR REPLACE INTO vernacular_base VALUES (?, ?, ?, ?, ?, ?)');
    let dbRows = 0;
    for (const [binomial, entry] of Object.entries(registry)) {
        if (binomial.startsWith('_')) continue;
        if (entry.inat_id == null && !hasNames(entry.vernacular)) continue;
        stmt.run([
            binomial,
            entry.inat_id ?? null,
            entry.vernacular?.nl ?? null,
            entry.vernacular?.en ?? null,
            entry.vernacular?.de ?? null,
            entry.vernacular?.fr ?? null,
        ]);
        dbRows++;
    }
    stmt.free();

    await fs.writeFile(OUT_FILE, Buffer.from(outDb.export()));
    outDb.close();

    process.stderr.write(`Wrote ${dbRows} entries to ${OUT_FILE}\n`);
}

async function fetchVernacularNames(taxonId) {
    const data  = await fetchJson(`${API}/taxa/${taxonId}?all_names=true`);
    const names = {};
    for (const { locale, name } of data.results[0]?.names ?? []) {
        if (LANGS.includes(locale) && !names[locale]) names[locale] = name;
    }
    return names;
}

main().catch(err => {
    process.stderr.write(`Error: ${err.stack}\n`);
    process.exit(1);
});
