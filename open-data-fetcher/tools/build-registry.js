#!/usr/bin/env node
/**
 * Merges vernacular names from cache.json into registry.json.
 *
 * cache.json is keyed by whatever was stored in the DB at fetch time (may be
 * dirty/abbreviated). We resolve each key to a canonical registry entry via the
 * inverted index (alias → canonical), then store the vernacular data there under
 * a `vernacular` field.
 *
 * Safe to re-run: only fills in missing languages, never overwrites existing data.
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { extractSpeciesBinomial } from '../lib/species.js';

const ROOT     = join(dirname(fileURLToPath(import.meta.url)), '..');
const REG_PATH = join(ROOT, 'registry.json');
const CACHE    = join(ROOT, 'tools/vernacular/base/cache.json');

const registry = JSON.parse(readFileSync(REG_PATH, 'utf8'));
const cache    = JSON.parse(readFileSync(CACHE, 'utf8'));
const LANGS    = ['nl', 'en', 'de', 'fr'];

// Build inverted index: alias → canonical, canonical → canonical
const index = new Map();
for (const [k, v] of Object.entries(registry)) {
    if (k.startsWith('_')) continue;
    index.set(k, k);
    for (const alias of v.aliases ?? []) index.set(alias, k);
}

let added = 0, skipped = 0;

for (const [key, val] of Object.entries(cache)) {
    if (!val || typeof val !== 'object') continue;
    const hasVernacular = LANGS.some(l => val[l]);
    if (!hasVernacular) continue;

    const normalizedKey = extractSpeciesBinomial(key.trim().toUpperCase().replace(/\s+/g, ' '));
    if (!normalizedKey) continue;

    const canonicalKey = index.get(normalizedKey);
    if (!canonicalKey) { skipped++; continue; }

    const entry = registry[canonicalKey];
    if (!entry.vernacular) entry.vernacular = {};
    for (const lang of LANGS) {
        if (val[lang] && !entry.vernacular[lang]) entry.vernacular[lang] = val[lang];
    }
    added++;
}

// Sort: _genusCorrections first, then canonical entries alphabetically
// Field order per entry: inat_id, vernacular, aliases
const sorted = { _genusCorrections: {} };
for (const k of Object.keys(registry._genusCorrections ?? {}).sort())
    sorted._genusCorrections[k] = registry._genusCorrections[k];
for (const k of Object.keys(registry).filter(k => !k.startsWith('_')).sort()) {
    const { inat_id, vernacular, aliases, ...rest } = registry[k];
    sorted[k] = {
        ...(inat_id !== undefined   ? { inat_id }                         : {}),
        ...(vernacular              ? { vernacular }                       : {}),
        ...(aliases?.length         ? { aliases: [...aliases].sort() }    : {}),
        ...rest,
    };
}

writeFileSync(REG_PATH, JSON.stringify(sorted, null, 2) + '\n');

const withVernacular = Object.values(sorted).filter(v => v?.vernacular).length;
console.log(`registry.json updated`);
console.log(`  ${added} cache entries merged, ${skipped} unmatched`);
console.log(`  ${withVernacular} canonical entries now have vernacular data`);
