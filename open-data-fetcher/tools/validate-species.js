#!/usr/bin/env node
/**
 * Validate species binomials across all city databases.
 *
 * Phase 0 — Stale binomials
 *   Rows where the stored species_binomial/cultivar no longer matches what
 *   processSpecies() produces with current overrides.js. Happens when a
 *   binomialCorrection was added after the last city import.
 *   Fix: node patch-binomials.js
 *
 * Phase 1 — Unresolvable: cache-internal matching
 *   Compares unresolvable species_binomials against iNat-validated ones in
 *   cache.json using edit distance (genus ≤ 1, epithet ≤ 2). Fast, no API calls.
 *
 * Phase 2 — Unresolvable: iNaturalist fallback
 *   For remaining unresolvable species, queries iNat and accepts the top result
 *   if within edit distance ≤ 2 of the query. Skipped with --no-inat.
 *
 * Suggested binomialCorrections are printed to stdout, ready to paste into
 * overrides.js. After adding them, run: node patch-binomials.js
 *
 * Usage:
 *   node tools/validate-species.js
 *   node tools/validate-species.js --no-inat
 *   node tools/validate-species.js --city amsterdam,rotterdam
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { execSync } from 'child_process';
import readline from 'readline';
import initSqlJs from 'sql.js';
import { CITIES } from '../config.js';
import { processSpecies } from '../lib/species.js';

const DIR      = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(DIR, '..', 'data');
const CACHE    = path.join(DIR, 'vernacular', 'base', 'cache.json');
const API      = 'https://api.inaturalist.org/v1';
const RATE_MS  = 700;

function parseArgs(argv) {
    const args = { city: null, noInat: false };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--city')    args.city   = argv[++i];
        if (argv[i] === '--no-inat') args.noInat = true;
    }
    return args;
}

function get(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'bomen-research' } }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
            res.on('error', reject);
        }).on('error', reject);
    });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function norm(s) {
    return s.toLowerCase().replace(/×\s*/g, '').replace(/\s+/g, ' ').trim();
}

function toProperCase(s) {
    const parts = s.toLowerCase().split(' ');
    const i = parts[0] === '×' ? 1 : 0;
    parts[i] = parts[i][0].toUpperCase() + parts[i].slice(1);
    return parts.join(' ');
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

async function readCityBinomials(cities, SQL) {
    // Returns:
    //   stale: Map<cityName, Array<{ species, oldBinomial, newBinomial }>>
    //   current: Set<species_binomial> — the effective binomials in the DBs
    const stale   = new Map();
    const current = new Set();

    for (const city of cities) {
        const dbPath = path.join(DATA_DIR, city.outputFile.sqlite);
        if (!existsSync(dbPath)) continue;

        const db  = new SQL.Database(await fs.readFile(dbPath));
        const res = db.exec('SELECT species, species_binomial, species_cultivar FROM trees WHERE species IS NOT NULL');
        db.close();
        const rows = res[0]?.values ?? [];

        const cityStale = [];
        // Accumulate unique (species → oldBinomial → newBinomial) for stale report
        const seen = new Map();

        for (const [species, oldBinomial, oldCultivar] of rows) {
            const result      = processSpecies(species);
            const newBinomial = result?.species_binomial ?? null;
            const newCultivar = result?.species_cultivar ?? null;

            if (newBinomial !== oldBinomial || newCultivar !== oldCultivar) {
                const key = `${species}|${oldBinomial}`;
                if (!seen.has(key)) {
                    seen.set(key, true);
                    cityStale.push({ species, oldBinomial, newBinomial });
                }
                // Use the corrected binomial as the effective value for phase 1/2
                if (newBinomial) current.add(newBinomial);
            } else {
                if (oldBinomial) current.add(oldBinomial);
            }
        }

        if (cityStale.length) stale.set(city.name, cityStale);
    }

    return { stale, current };
}

function matchFromCache(nulls, found, cache) {
    const matched   = [];
    const remaining = [];

    for (const raw of nulls) {
        const parts   = norm(raw).split(' ');
        const genus   = parts[0];
        const epithet = parts.slice(1).join(' ');

        let best = null, bestTotal = Infinity;

        for (const key of found) {
            const kParts   = norm(key).split(' ');
            const kGenus   = kParts[0];
            const kEpithet = kParts.slice(1).join(' ');

            const gDist = levenshtein(genus, kGenus);
            if (gDist > 1) continue;
            const eDist = levenshtein(epithet, kEpithet);
            if (eDist > 2) continue;

            const total = gDist + eDist;
            if (total < bestTotal || (total === bestTotal && key < best?.key)) {
                bestTotal = total;
                best = { key, gDist, eDist };
            }
        }

        if (best && best.key !== raw) {
            const canonical = cache[best.key]?.name?.toUpperCase() ?? best.key;
            matched.push({ from: raw, to: canonical, fuzzyGenus: best.gDist > 0 });
            process.stderr.write(`  [cache] ${raw} → ${best.key}${best.gDist > 0 ? ' (fuzzy genus)' : ''}\n`);
        } else {
            remaining.push(raw);
        }
    }

    return { matched, remaining };
}

async function main() {
    const args   = parseArgs(process.argv.slice(2));
    const cities = args.city
        ? args.city.split(',').map(n => CITIES[n.trim()]).filter(Boolean)
        : Object.values(CITIES);

    const SQL = await initSqlJs();

    // ── Phase 0: stale binomials ──────────────────────────────────────────────
    process.stderr.write('Phase 0: checking for stale binomials...\n');
    const { stale, current } = await readCityBinomials(cities, SQL);

    if (stale.size === 0) {
        process.stderr.write('  No stale binomials found.\n\n');
    } else {
        let totalStale = 0;
        for (const [cityName, entries] of stale) {
            process.stderr.write(`  [${cityName}] ${entries.length} stale:\n`);
            for (const { species, oldBinomial, newBinomial } of entries) {
                process.stderr.write(`    ${species}: ${oldBinomial} → ${newBinomial}\n`);
            }
            totalStale += entries.length;
        }
        process.stderr.write(`\n  ${totalStale} stale species across ${stale.size} cities — run: node patch-binomials.js\n\n`);
    }

    // ── Phase 1 & 2: unresolvable binomials ──────────────────────────────────
    if (!existsSync(CACHE)) {
        process.stderr.write('cache.json not found — run fetch-vernacular-base first.\n');
        return;
    }

    const cache = JSON.parse(await fs.readFile(CACHE, 'utf8'));
    const found = Object.entries(cache).filter(([, v]) => v !== null).map(([k]) => k);

    // Only check binomials actually present in city DBs
    const nulls     = [...current].filter(b => b in cache && cache[b] === null);
    const notCached = [...current].filter(b => !(b in cache));
    // Both groups lack a confirmed iNat match — fuzzy-match both against
    // already-resolved binomials, so a typo from a newly-added city (never
    // seen before, hence "notCached" rather than a cached null) still gets
    // caught instead of going straight to a raw iNat lookup in fetch.js.
    const unresolved = [...nulls, ...notCached];

    process.stderr.write(`Phase 1: cache-internal matching (${unresolved.length} unresolved vs ${found.length} found)...\n`);
    const { matched: cacheMatches, remaining } = matchFromCache(unresolved, found, cache);
    process.stderr.write(`  ${cacheMatches.length} matched, ${remaining.length} need iNat lookup\n\n`);

    const inatMatches = [];

    if (!args.noInat && remaining.length > 0) {
        process.stderr.write(`Phase 2: iNaturalist lookup (${remaining.length} entries, ~${Math.round(remaining.length * RATE_MS * 2 / 60000)} min)...\n`);
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

            const normQuery = norm(name);
            const exact = data.results.find(t => norm(t.name) === normQuery);
            let match = exact ?? null, fuzzy = false;

            if (!exact) {
                const top = data.results[0];
                if (top && levenshtein(norm(top.name), normQuery) <= 2) {
                    match = top;
                    fuzzy = true;
                }
            }

            if (!match || match.name.toUpperCase() === raw) {
                process.stderr.write(`  NOT FOUND: ${raw}\n`);
                notFound++;
                continue;
            }

            process.stderr.write(`  [inat] ${raw} →${fuzzy ? '~' : ''} ${match.name}\n`);
            inatMatches.push({ from: raw, to: match.name.toUpperCase(), fuzzy });
        }

        process.stderr.write(`\n  ${inatMatches.length} matched, ${notFound} not found\n`);
    } else if (args.noInat && remaining.length > 0) {
        process.stderr.write(`Phase 2: skipped (--no-inat). ${remaining.length} unresolved.\n`);
    }

    const suggestions = [...cacheMatches, ...inatMatches];
    if (suggestions.length === 0) {
        process.stderr.write('\nNo corrections to suggest.\n');
        return;
    }

    process.stderr.write(`\n${suggestions.length} suggestions — paste into binomialCorrections in overrides.js,\nthen run: node patch-binomials.js\n\n`);
    const lines = [];
    for (const { from, to, fuzzyGenus, fuzzy } of suggestions) {
        const tag   = fuzzyGenus ? ' // fuzzy-genus' : fuzzy ? ' // fuzzy' : '';
        const value = fuzzyGenus ? to.split(' ')[0] : to;
        const key   = fuzzyGenus ? `'${from.split(' ')[0]}':` : `'${from}':`;
        lines.push(`  ${key.padEnd(38)}'${value}',${tag}`);
    }
    const output = lines.join('\n') + '\n';
    process.stderr.write(output);
    process.stdout.write(output);

    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    await new Promise(resolve => rl.question('Copy to clipboard? [Y/n] ', answer => {
        rl.close();
        if (answer.trim().toLowerCase() !== 'n') {
            try {
                const cmd = process.platform === 'darwin' ? 'pbcopy'
                          : process.platform === 'win32'  ? 'powershell -noprofile -command "[Console]::InputEncoding=[System.Text.Encoding]::UTF8; Set-Clipboard([Console]::In.ReadToEnd())"'
                          : 'xclip -selection clipboard';
                execSync(cmd, { input: output });
                process.stderr.write('Copied.\n');
            } catch {
                process.stderr.write('Clipboard unavailable.\n');
            }
        }
        resolve();
    }));
}

main().catch(err => { process.stderr.write(`Error: ${err.stack}\n`); process.exit(1); });
