#!/usr/bin/env node
/**
 * End-to-end pipeline to run after wiring up one or more new cities
 * (cities/<id>.js + config.js registration already done): fetch their full
 * datasets, find any new species overrides, patch all city databases,
 * rebuild vernacular names, and copy every .db into api/data/.
 *
 * The global steps (patch/vernacular/copy) run once for the whole batch,
 * not once per city — pass a comma-separated list to avoid redundant
 * validate-species / patch-binomials / fetch-vernacular-base runs.
 *
 * Before anything else, each city is checked up front for an existing
 * data/<city>.db. If found, you're asked whether to refetch; declining
 * leaves that city out of the fetch step entirely and reuses the file
 * already on disk. Under --yes this check defaults to NOT refetching
 * (use existing data) — the point of --yes here is to avoid needless
 * network calls, not to force a refetch.
 *
 * Usage:
 *   node add-city.js --city utrecht
 *   node add-city.js --city utrecht,arnhem,nijmegen
 *   node add-city.js --city utrecht,arnhem --yes   # skip confirmation prompts
 *
 * The override-review pause is not controlled by --yes: when
 * validate-species finds suggestions, pasting them into overrides.js is a
 * manual edit no flag can substitute for, so the script always stops there.
 */

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { CITIES } from './config.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');

function parseArgs(argv) {
    const args = { cities: null, yes: false };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--city') args.cities = argv[++i];
        if (argv[i] === '--yes' || argv[i] === '-y') args.yes = true;
    }
    if (!args.cities) {
        process.stderr.write('Usage: node add-city.js --city <name>[,<name>...] [--yes]\n');
        process.exit(1);
    }
    const list = args.cities.split(',').map(c => c.trim());
    const unknown = list.filter(c => !(c in CITIES));
    if (unknown.length) {
        process.stderr.write(`Unknown city "${unknown.join(', ')}". Available: ${Object.keys(CITIES).join(', ')}\n`);
        process.exit(1);
    }
    return { cities: list, cityArg: list.join(','), yes: args.yes };
}

function ask(question) {
    return new Promise(resolve => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
    });
}

async function confirm(label, skip) {
    if (skip) {
        process.stdout.write(`\n→ ${label}\n`);
        return true;
    }
    const answer = await ask(`\n→ ${label}? [Y/n] `);
    return answer === '' || answer.toLowerCase() === 'y';
}

function run(cmd, args) {
    process.stdout.write(`  $ ${cmd} ${args.join(' ')}\n`);
    const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
    if (result.status !== 0) {
        process.stderr.write(`Command failed with exit code ${result.status}\n`);
        process.exit(result.status ?? 1);
    }
}

function runCapturingStdout(cmd, args) {
    process.stdout.write(`  $ ${cmd} ${args.join(' ')}\n`);
    const result = spawnSync(cmd, args, { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8', shell: true });
    if (result.status !== 0) {
        process.stderr.write(`Command failed with exit code ${result.status}\n`);
        process.exit(result.status ?? 1);
    }
    return result.stdout;
}

// Per city, up front: if data/<city>.db already exists, ask whether to
// refetch. Returns the subset of cities that should actually be fetched.
async function resolveCitiesToFetch(cities, yes) {
    process.stdout.write('\n→ Checking for existing data...\n');
    const toFetch = [];

    for (const id of cities) {
        const dbPath = path.join(DATA_DIR, CITIES[id].outputFile.sqlite);
        if (!existsSync(dbPath)) {
            toFetch.push(id);
            continue;
        }

        if (yes) {
            process.stdout.write(`  ${id}: data/${CITIES[id].outputFile.sqlite} already exists — using existing data\n`);
            continue;
        }

        const answer = await ask(`  ${id}: data/${CITIES[id].outputFile.sqlite} already exists. Refetch? [y/N] `);
        if (answer.toLowerCase() === 'y') {
            toFetch.push(id);
        } else {
            process.stdout.write(`  ${id}: using existing data\n`);
        }
    }

    return toFetch;
}

async function main() {
    const { cities, cityArg, yes } = parseArgs(process.argv.slice(2));

    const toFetch = await resolveCitiesToFetch(cities, yes);

    if (toFetch.length === 0) {
        process.stdout.write('\nAll selected cities already have data — skipping fetch.\n');
    } else {
        const fetchArg   = toFetch.join(',');
        const fetchLabel = toFetch.length > 1 ? `${toFetch.length} cities (${fetchArg})` : fetchArg;

        if (await confirm(`Fetch full dataset for ${fetchLabel}`, yes)) {
            run('node', ['index.js', '--city', fetchArg, '--all']);
        } else {
            process.stdout.write('\nAborted.\n');
            return;
        }
    }

    const label = cities.length > 1 ? `${cities.length} cities (${cityArg})` : cityArg;
    process.stdout.write(`\n→ Checking for species needing new overrides (${label})...\n`);
    const suggestions = runCapturingStdout('node', ['tools/validate-species.js', '--city', cityArg]);

    const hasSuggestions = Boolean(suggestions.trim());

    if (hasSuggestions) {
        process.stdout.write('\nSuggested overrides.js entries:\n\n' + suggestions + '\n');
        process.stdout.write('⚠ Add the relevant entries to binomialCorrections in overrides.js now.\n');
        process.stdout.write('  Review lines marked "// fuzzy" / "// fuzzy-genus" before accepting.\n');
        await ask('Press Enter once overrides.js is updated (Ctrl+C to abort)... ');
    } else {
        process.stdout.write('  No new overrides needed.\n');
    }

    const patchLabel = hasSuggestions
        ? 'Patch binomials across all city databases'
        : 'No suggestions found — patch anyway (e.g. for overrides added manually)';

    if (await confirm(patchLabel, yes)) {
        run('node', ['patch-binomials.js']);
    }

    if (await confirm('Fetch vernacular names for newly-resolved species', yes)) {
        run('node', ['tools/vernacular/base/fetch.js']);
    }

    const vernacularLabel = hasSuggestions
        ? 'Rebuild vernacular-nl.db'
        : 'No suggestions found — rebuild vernacular-nl.db anyway (e.g. for overrides-nl.js edits)';

    if (await confirm(vernacularLabel, yes)) {
        run('node', ['tools/vernacular/nl/merge.js']);
    }

    if (await confirm('Copy all .db files into api/data/', yes)) {
        run('npm', ['run', 'copy-data']);
    }

    process.stdout.write('\nDone.\n');
}

main().catch(err => { process.stderr.write(`Error: ${err.stack}\n`); process.exit(1); });
