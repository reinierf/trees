#!/usr/bin/env node
/**
 * Scan cache.json for null entries and suggest binomialCorrections entries.
 *
 * Two-pass strategy:
 *   1. Cache-internal matching — compare each null against found entries using
 *      edit distance (genus ≤ 1, epithet ≤ 2). No API calls; fast and reliable
 *      because the target is already iNaturalist-validated.
 *   2. iNaturalist fallback — for remaining nulls, query the API and accept the
 *      top result if within edit distance ≤ 2 of the full normalised name.
 *
 * Progress goes to stderr. Suggested corrections go to stdout, formatted as
 * JS object entries ready to paste into overrides.js.
 *
 * Usage: node tools/vernacular/base/suggest-corrections.js
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const DIR     = path.dirname(fileURLToPath(import.meta.url));
const CACHE   = path.join(DIR, 'cache.json');
const API     = 'https://api.inaturalist.org/v1';
const RATE_MS = 700;

function get(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': 'bomen-research' } }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
            res.on('error', reject);
        }).on('error', reject);
    });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function toProperCase(s) {
    const parts = s.toLowerCase().split(' ');
    parts[0] = parts[0][0].toUpperCase() + parts[0].slice(1);
    return parts.join(' ');
}

// Normalise for comparison: lowercase, strip hybrid marker, collapse spaces.
function norm(s) {
    return s.toLowerCase().replace(/×\s*/g, '').replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => i || j));
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = a[i-1] === b[j-1]
                ? dp[i-1][j-1]
                : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    return dp[m][n];
}

// Pass 1: match nulls against found entries already in the cache.
// genus distance ≤ 1, epithet distance ≤ 2. Picks lowest total distance.
function matchFromCache(nulls, found) {
    const matched   = [];
    const remaining = [];

    for (const raw of nulls) {
        const parts   = norm(raw).split(' ');
        const genus   = parts[0];
        const epithet = parts.slice(1).join(' ');

        let best = null;
        let bestTotal = Infinity;

        for (const key of found) {
            const kParts   = norm(key).split(' ');
            const kGenus   = kParts[0];
            const kEpithet = kParts.slice(1).join(' ');

            const gDist = levenshtein(genus, kGenus);
            if (gDist > 1) continue;

            const eDist = levenshtein(epithet, kEpithet);
            if (eDist > 2) continue;

            const total = gDist + eDist;
            if (total < bestTotal || (total === bestTotal && key < best.key)) {
                bestTotal = total;
                best = { key, gDist, eDist };
            }
        }

        if (best && best.key !== raw) {
            matched.push({ from: raw, to: best.key, fuzzyGenus: best.gDist > 0 });
            process.stderr.write(`  [cache] ${raw} → ${best.key}${best.gDist > 0 ? ' (fuzzy genus)' : ''}\n`);
        } else {
            remaining.push(raw);
        }
    }

    return { matched, remaining };
}

async function main() {
    const cache = JSON.parse(await fs.readFile(CACHE, 'utf8'));

    const nulls = Object.entries(cache)
        .filter(([, v]) => v === null)
        .map(([k]) => k);

    // × entries already work after the rank fix — they just need a re-run, no correction entry.
    const withCross    = nulls.filter(k => k.includes('×'));
    const withoutCross = nulls.filter(k => !k.includes('×'));

    // found = keys with a valid iNaturalist entry (has id or any language name)
    const found = Object.entries(cache)
        .filter(([, v]) => v !== null)
        .map(([k]) => k);

    process.stderr.write(`${nulls.length} null entries total\n`);
    process.stderr.write(`  ${withCross.length} contain × — will resolve on next fetch run, skipping\n`);
    process.stderr.write(`  ${withoutCross.length} without × — checking against ${found.length} found entries\n\n`);

    // Pass 1: cache-internal matching
    const { matched: cacheMatches, remaining } = matchFromCache(withoutCross, found);

    process.stderr.write(`\n  ${cacheMatches.length} matched from cache, ${remaining.length} need iNaturalist lookup\n\n`);

    // Pass 2: iNaturalist fallback for remaining nulls
    const inatMatches = [];
    let notFound = 0;

    for (const raw of remaining) {
        const name = toProperCase(raw);
        await sleep(RATE_MS);

        let data;
        try {
            data = await get(`${API}/taxa?q=${encodeURIComponent(name)}&per_page=5`);
        } catch (e) {
            process.stderr.write(`  ERROR ${raw}: ${e.message}\n`);
            continue;
        }

        // Prefer an exact normalised match; fall back to the top result if it's
        // within edit distance ≤ 2 (catches single-character typos like FREMANII).
        const normQuery = norm(name);
        const exact = data.results.find(t => norm(t.name) === normQuery);
        let match = exact ?? null;
        let fuzzy = false;

        if (!exact) {
            const top = data.results[0];
            if (top && levenshtein(norm(top.name), normQuery) <= 2) {
                match = top;
                fuzzy = true;
            }
        }

        if (!match) {
            process.stderr.write(`  NOT FOUND: ${raw}\n`);
            notFound++;
            continue;
        }

        const canonical = match.name.toUpperCase();

        if (canonical === raw) {
            process.stderr.write(`  SAME: ${raw}\n`);
            notFound++;
            continue;
        }

        process.stderr.write(`  [inat] ${raw} →${fuzzy ? '~' : ''} ${match.name} (${match.rank})\n`);
        inatMatches.push({ from: raw, to: canonical, fuzzy });
    }

    const suggestions = [...cacheMatches, ...inatMatches];

    process.stderr.write(`\n${suggestions.length} suggestions total (${cacheMatches.length} from cache, ${inatMatches.length} from iNat), ${notFound} not found\n\n`);

    if (suggestions.length === 0) return;

    // stdout: paste-ready JS entries for binomialCorrections in overrides.js
    for (const { from, to, fuzzyGenus, fuzzy } of suggestions) {
        const k   = `'${from}':`;
        const v   = `'${to}'`;
        const tag = fuzzyGenus ? ' // fuzzy-genus' : fuzzy ? ' // fuzzy' : '';
        process.stdout.write(`    ${k.padEnd(37)} ${v},${tag}\n`);
    }
}

main().catch(err => {
    process.stderr.write(`Error: ${err.stack}\n`);
    process.exit(1);
});
