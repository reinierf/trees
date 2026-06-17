#!/usr/bin/env node
/**
 * Fetch municipal tree datasets for one or more Dutch cities.
 *
 * Usage:
 *   node index.js                              # fetch all cities, first 100 trees each → SQLite
 *   node index.js --city rotterdam             # Rotterdam only
 *   node index.js --city rotterdam,groningen   # both cities
 *   node index.js --city groningen --all       # full Groningen dataset → SQLite
 *   node index.js --city rotterdam --all --format json
 *   node index.js --city rotterdam --count 500 --page 1
 *   node index.js --city groningen --count 5 -d   # dry run: print to console
 *   node index.js --city rotterdam --layer ms:obs_bmn_bijz
 *
 * Available cities: rotterdam, groningen, amsterdam, den-haag, utrecht, arnhem, nijmegen, zwolle, apeldoorn
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { CITIES } from './config.js';
import { fetchRaw } from './lib/http.js';
import { drawProgress } from './lib/progress.js';
import { writeJSON, writeSQLite } from './lib/writers.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');

function parseArgs(argv) {
    const args = {
        city: null, count: 100, page: 0, all: false,
        dry: false, format: 'sqlite', layer: null, output: null,
    };
    for (let i = 0; i < argv.length; i++) {
        switch (argv[i]) {
            case '--city':   args.city   = argv[++i]; break;
            case '--count':  args.count  = parseInt(argv[++i], 10); break;
            case '--page':   args.page   = parseInt(argv[++i], 10); break;
            case '--layer':  args.layer  = argv[++i]; break;
            case '--format': args.format = argv[++i]; break;
            case '--output': args.output = argv[++i]; break;
            case '--all':    args.all    = true;       break;
            case '-d':       args.dry    = true;       break;
        }
    }
    return args;
}

function selectCities(cityArg) {
    if (!cityArg || cityArg === 'all') return Object.values(CITIES);
    return cityArg.split(',').map(name => {
        const city = CITIES[name.trim()];
        if (!city) {
            throw new Error(`Unknown city: "${name.trim()}". Available: ${Object.keys(CITIES).join(', ')}`);
        }
        return city;
    });
}

function mergeDropped(accum, pageDropped) {
    if (!pageDropped) return;
    for (const [reason, count] of Object.entries(pageDropped)) {
        accum[reason] = (accum[reason] ?? 0) + count;
    }
}

function reportDropped(cityName, dropped, totalRaw) {
    const totalDropped = Object.values(dropped).reduce((a, b) => a + b, 0);
    if (totalDropped === 0) return;
    const pct = totalRaw > 0 ? ` (${((totalDropped / totalRaw) * 100).toFixed(1)}%)` : '';
    process.stderr.write(`[${cityName}] Dropped ${totalDropped}/${totalRaw}${pct} entries:\n`);
    for (const [reason, count] of Object.entries(dropped)) {
        process.stderr.write(`  ${reason}: ${count}\n`);
    }
}

async function fetchCity(city, args, fetchedAt) {
    const layers     = args.layer ? [args.layer] : (city.layers ?? [city.layer]);
    const multiLayer = layers.length > 1;
    let trees        = [];
    const dropped    = {};
    let totalRaw     = 0;

    for (const layer of layers) {
        const url = typeof city.wfsUrl === 'function' ? city.wfsUrl(layer) : city.wfsUrl;
        const tag = multiLayer ? ` (layer ${layer})` : '';

        if (city.singleFetch) {
            process.stderr.write(`[${city.name}] Fetching dataset${tag}...\n`);
            const raw = await fetchRaw(url, new URLSearchParams(), city.fetchOptions);
            const { trees: all, dropped: d } = await city.parse(raw, layer);
            mergeDropped(dropped, d);
            totalRaw += all.length + Object.values(d ?? {}).reduce((a, b) => a + b, 0);
            const page = args.all ? all : all.slice(args.page * args.count, args.page * args.count + args.count);
            trees.push(...page);
            drawProgress(page.length, args.all ? all.length : args.count);
        } else if (args.all) {
            const pageSize = 1000;
            let startIndex = 0;
            let layerCount = 0;

            process.stderr.write(`[${city.name}] Counting trees${tag}...\n`);
            const countRaw = await fetchRaw(url, city.countParams(layer), city.fetchOptions);
            const total    = await city.parseCount(countRaw);
            process.stderr.write(`[${city.name}] ${total} trees in dataset.\n`);
            drawProgress(0, total);

            while (true) {
                const raw = await fetchRaw(url, city.pageParams(layer, pageSize, startIndex), city.fetchOptions);
                const { trees: page, rawCount, dropped: d } = await city.parse(raw, layer);
                mergeDropped(dropped, d);
                totalRaw += rawCount;
                trees.push(...page);
                layerCount += page.length;
                drawProgress(layerCount, total);
                if (rawCount < pageSize) break;
                startIndex += pageSize;
            }
        } else {
            const startIndex = args.page * args.count;
            const raw = await fetchRaw(url, city.pageParams(layer, args.count, startIndex), city.fetchOptions);
            const { trees: page, rawCount, dropped: d } = await city.parse(raw, layer);
            mergeDropped(dropped, d);
            totalRaw += rawCount ?? page.length;
            trees.push(...page);
            drawProgress(trees.length, args.count);
        }
    }

    if (city.postProcess) trees = city.postProcess(trees);

    for (const t of trees) {
        t.city         = city.name;
        t.last_fetched = fetchedAt;
    }

    process.stderr.write(`[${city.name}] Got ${trees.length} trees.\n`);
    reportDropped(city.name, dropped, totalRaw);
    return trees;
}

async function main() {
    const args     = parseArgs(process.argv.slice(2));
    const cities   = selectCities(args.city);
    const fetchedAt = new Date().toISOString();

    if (args.output && cities.length > 1) {
        process.stderr.write('Warning: --output ignored when fetching multiple cities.\n');
        args.output = null;
    }
    if (args.layer && cities.length > 1) {
        process.stderr.write(`Warning: --layer "${args.layer}" applied to all selected cities.\n`);
    }

    for (const city of cities) {
        const trees = await fetchCity(city, args, fetchedAt);

        if (args.dry) {
            process.stdout.write(JSON.stringify(trees, null, 2) + '\n');
            continue;
        }

        const outFile = args.output ?? path.join(DATA_DIR, city.outputFile[args.format]);
        if (!outFile) {
            throw new Error(`Unknown format "${args.format}". Use "json" or "sqlite".`);
        }

        if (args.format === 'sqlite') {
            process.stderr.write(`[${city.name}] Writing SQLite database...\n`);
            await writeSQLite(trees, outFile);
        } else {
            await writeJSON(trees, outFile);
        }
        process.stderr.write(`[${city.name}] Written to ${outFile}\n`);
    }
}

main().catch(err => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
});
