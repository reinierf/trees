import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { dropTerms, unknownTerms } from '../overrides.js';

// --- Registry (lazy-loaded on first use) ---

const REGISTRY_PATH = join(dirname(fileURLToPath(import.meta.url)), '../registry.json');
let _registry = null;
let _index    = null; // Map: alias|canonical → canonical key
let _keys     = null; // Array of canonical keys for fuzzy matching

// Normalize a key before indexing/lookup: uppercase + strip trailing dots per token.
// Mid-word dots (e.g. "AESCUL.HIPPOCASTANUM") are preserved; only trailing ones stripped.
function normalizeKey(s) {
    return s.toUpperCase().split(' ').map(w => w.replace(/\.+$/, '')).join(' ').trim();
}

function getRegistry() {
    if (_registry) return { registry: _registry, index: _index, keys: _keys };
    _registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
    _index = new Map();
    for (const [key, val] of Object.entries(_registry)) {
        if (key.startsWith('_')) continue;
        _index.set(normalizeKey(key), key);
        for (const alias of (val.aliases ?? []))
            _index.set(normalizeKey(alias), key);
    }
    _keys = Object.keys(_registry).filter(k => !k.startsWith('_'));
    return { registry: _registry, index: _index, keys: _keys };
}

// --- Genus correction ---

function applyGenusCorrections(candidate) {
    const { registry } = getRegistry();
    const corrections = registry._genusCorrections;
    const spaceIdx = candidate.indexOf(' ');
    if (spaceIdx === -1) return corrections[candidate] ?? candidate;
    const genus = candidate.slice(0, spaceIdx);
    return (corrections[genus] ?? genus) + candidate.slice(spaceIdx);
}

// --- Fuzzy matching ---

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

// Splits a normalized binomial into { genus, epithet } for comparison.
// Returns null for leading-× intergeneric hybrids (rare, skip fuzzy for those).
function parseParts(key) {
    const words = key.split(' ');
    if (words[0] === '×') return null;
    if (words[1] === '×' && words[2]) return { genus: words[0], epithet: words[2] };
    return { genus: words[0], epithet: words[1] ?? '' };
}

function fuzzyMatchKeys(candidate, keys) {
    const cp = parseParts(candidate);
    if (!cp) return null;
    let best = null, bestDist = Infinity;
    for (const key of keys) {
        const kp = parseParts(normalizeKey(key));
        if (!kp) continue;
        const gd = levenshtein(cp.genus, kp.genus);
        if (gd > 1) continue;
        const ed = levenshtein(cp.epithet, kp.epithet);
        if (ed > 2) continue;
        const dist = gd + ed;
        if (dist < bestDist) { best = key; bestDist = dist; }
    }
    return best;
}

// --- Fuzzy log (in-memory; flush via writeFuzzyLog) ---

const _fuzzyLog = [];

export function getFuzzyLog() { return [..._fuzzyLog]; }

export function clearFuzzyLog() { _fuzzyLog.length = 0; }

// --- Core resolution ---

// Returns { species_binomial, resolvedBy } where resolvedBy is
// 'exact' | 'alias' | 'fuzzy' | 'as-is'.
export function resolveCandidate(candidate) {
    const corrected = applyGenusCorrections(normalizeKey(candidate));
    const { index, keys } = getRegistry();

    const hit = index.get(corrected);
    if (hit !== undefined) {
        return { species_binomial: hit, resolvedBy: hit === corrected ? 'exact' : 'alias' };
    }

    const fuzzy = fuzzyMatchKeys(corrected, keys);
    if (fuzzy) {
        _fuzzyLog.push({ candidate, corrected, matched: fuzzy, date: new Date().toISOString().slice(0, 10) });
        return { species_binomial: fuzzy, resolvedBy: 'fuzzy' };
    }

    return { species_binomial: corrected, resolvedBy: 'as-is' };
}

// --- Filter setup ---

const _dropSet      = new Set(dropTerms.filter(e => typeof e === 'string').map(s => s.toUpperCase()));
const _dropPatterns = dropTerms.filter(e => e instanceof RegExp);
const _unknownSet   = new Set(unknownTerms.filter(e => typeof e === 'string').map(s => s.toUpperCase()));
const _unknownPat   = unknownTerms.filter(e => e instanceof RegExp);

function isDrop(upper)    { return _dropSet.has(upper)    || _dropPatterns.some(p => p.test(upper)); }
function isUnknown(upper) { return _unknownSet.has(upper) || _unknownPat.some(p => p.test(upper)); }

// --- Public API ---

export const RANK_MARKERS = new Set([
    'SUBSP.', 'SUBSP', 'SSP.', 'SSP', 'SP.', 'SP', 'SPP.',
    'VAR.', 'VAR', 'F.', 'CV.', 'CV*', 'CV',
    'SPEC.', 'SPEC', 'SPECIES',
]);

// Returns { species_binomial, species_cultivar } or null if the record should
// be dropped. species_binomial may be null when the species is genuinely unknown.
export function processSpecies(raw) {
    if (!raw) return null;
    raw = raw.replace(/-([A-Za-z][A-Za-z0-9 ]*)-/g, (_, n) => `'${n.trim()}'`);
    raw = raw.replace(/\?([A-Za-z][A-Za-z0-9 ]*)\?/g, (_, n) => `'${n.trim()}'`);
    raw = raw.replace(/ -[A-Za-z].*/g, '');
    const upper = raw.trim().replace(/\s+/g, ' ').toUpperCase();
    if (isDrop(upper))    return null;
    if (isUnknown(upper)) return { species_binomial: null, species_cultivar: null };
    const candidate = extractSpeciesBinomial(upper);
    if (!candidate) return null;
    const { species_binomial } = resolveCandidate(candidate);
    return { species_binomial, species_cultivar: extractSpeciesCultivar(upper) };
}

// Like processSpecies but returns a failure reason instead of null.
// On success also includes resolvedBy for diagnostic purposes.
export function processSpeciesTagged(raw) {
    if (!raw) return { dropped: 'empty_species' };
    raw = raw.replace(/-([A-Za-z][A-Za-z0-9 ]*)-/g, (_, n) => `'${n.trim()}'`);
    raw = raw.replace(/\?([A-Za-z][A-Za-z0-9 ]*)\?/g, (_, n) => `'${n.trim()}'`);
    raw = raw.replace(/ -[A-Za-z].*/g, '');
    const upper = raw.trim().replace(/\s+/g, ' ').toUpperCase();
    if (isDrop(upper))    return { dropped: 'filtered' };
    if (isUnknown(upper)) return { species_binomial: null, species_cultivar: null, resolvedBy: 'unknown' };
    const candidate = extractSpeciesBinomial(upper);
    if (!candidate) return { dropped: 'no_binomial' };
    const { species_binomial, resolvedBy } = resolveCandidate(candidate);
    return { species_binomial, species_cultivar: extractSpeciesCultivar(upper), resolvedBy };
}

// Dutch vernacular name for a canonical species_binomial (as returned by
// processSpecies), or null if the registry has none. Reuses the same
// lazily-loaded registry cache as resolveCandidate.
export function getVernacularNl(binomial) {
    if (!binomial) return null;
    const { registry } = getRegistry();
    return registry[binomial]?.vernacular?.nl ?? null;
}

export function extractSpeciesBinomial(s) {
    if (!s) return null;
    s = s.replace(/["`]/g, "'");
    s = s.replace(/'.*$/, '').replace(/\(.*$/, '').trim();
    s = s.replace(/\s+(SUBSP\.|SUBSP|SSP\.|SSP|SP\.|SPP\.|SP|VAR\.|VAR|F\.|CV\.|CV\*|CV|SPEC\.|SPEC|SPECIES)(\s|$).*/i, '').trim();
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;
    if (words.length === 1) return words[0];
    if ((words[1] === '×' || words[1] === 'X') && words[2]) return `${words[0]} × ${words[2]}`;
    return `${words[0]} ${words[1]}`;
}

export function extractSpeciesCultivar(s) {
    if (!s) return null;
    s = s.replace(/["`]/g, "'");
    const icncp = s.match(/\('([^')]+)'\)?/);
    if (icncp) return icncp[1].trim() || null;
    const quoted = s.match(/'([^']+)'/);
    if (quoted) return quoted[1].trim() || null;
    const words = s.split(/\s+/).filter(Boolean);
    const skip = (words[1] === '×' || words[1] === 'X') ? 3 : 2;
    if (words.length <= skip) return null;
    const rest = words.slice(skip);
    if (RANK_MARKERS.has(rest[0])) return null;
    const filtered = rest
        .filter(w => !RANK_MARKERS.has(w))
        .join(' ')
        .replace(/\(.*$/, '')
        .replace(/\([^)]*\)/g, '')
        .trim();
    return filtered || null;
}
