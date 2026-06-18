#!/usr/bin/env node
/**
 * Rewrite binomialCorrections in overrides.js into a deduped, sorted table.
 *
 * Bucket order:
 *   1. Genus-only corrections
 *   2. Full binomials
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, '..');
const OVERRIDES = path.join(ROOT, 'overrides.js');

function classify(value) {
  return typeof value === 'string' && !value.includes(' ') && !value.includes('×');
}

function sortEntries(entries) {
  return entries.sort((a, b) => a[0].localeCompare(b[0], 'en', { sensitivity: 'base' }));
}

function render(entries) {
  const lines = ['export const binomialCorrections = {'];
  for (const [key, value] of entries) {
    lines.push(`  '${key}': '${value}',`);
  }
  lines.push('};');
  return lines.join('\n');
}

async function main() {
  const source = await fs.readFile(OVERRIDES, 'utf8');
  const match = source.match(/export const binomialCorrections = \{([\s\S]*?)\n\};/);
  if (!match) {
    throw new Error('binomialCorrections object not found in overrides.js');
  }

  const objectValue = Function('return ({' + match[1] + '});')();
  const uniqueEntries = Object.entries(objectValue);
  const genus = [];
  const full = [];

  for (const entry of uniqueEntries) {
    (classify(entry[1]) ? genus : full).push(entry);
  }

  const rewritten = [
    source.slice(0, match.index),
    render([...sortEntries(genus), ...sortEntries(full)]),
    source.slice(match.index + match[0].length),
  ].join('');

  await fs.writeFile(OVERRIDES, rewritten, 'utf8');
  process.stdout.write(`Rewrote ${path.relative(ROOT, OVERRIDES)}\n`);
}

main().catch(err => {
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exitCode = 1;
});
