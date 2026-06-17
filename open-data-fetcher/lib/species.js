import { binomialCorrections, filterSpecies } from '../overrides.js';

const _filterSet      = new Set(filterSpecies.filter(e => typeof e === 'string').map(s => s.toUpperCase()));
const _filterPatterns = filterSpecies.filter(e => e instanceof RegExp);

function applyBinomialCorrections(s) {
    for (const [wrong, right] of Object.entries(binomialCorrections)) {
        // Escape regex metacharacters in the key, then wrap in \b…(?!\w):
        // \b      — only match at a word boundary (won't fire mid-word)
        // (?!\w)  — don't match if immediately followed by a word character,
        //           so a truncated key like "FRAXINIFO" won't corrupt the full
        //           binomial "FRAXINIFOLIA" by replacing its prefix.
        const escaped = wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        s = s.replace(new RegExp(`\\b${escaped}(?!\\w)`, 'gi'), right);
    }
    return s;
}

// Returns { species_binomial, species_cultivar } or null if filtered/unresolvable.
export function processSpecies(raw) {
    if (!raw) return null;
    // Dash-wrapped cultivar notation used by some OBK exports: "-Name-" → "'Name'".
    // Truncated forms with no closing dash (e.g. "Magnolia -Heaven") get the hint stripped.
    raw = raw.replace(/-([A-Za-z][A-Za-z0-9 ]*)-/g, (_, n) => `'${n.trim()}'`);
    raw = raw.replace(/ -[A-Za-z].*/g, '');
    const upper = raw.trim().replace(/\s+/g, ' ').toUpperCase();
    if (_filterSet.has(upper) || _filterPatterns.some(p => p.test(upper))) return null;
    const corrected = applyBinomialCorrections(upper);
    const species_binomial = extractSpeciesBinomial(corrected);
    if (!species_binomial) return null;
    return { species_binomial, species_cultivar: extractSpeciesCultivar(corrected) };
}

// Like processSpecies but returns a failure reason instead of null.
// On success: { species_binomial, species_cultivar }
// On failure: { dropped: 'empty_species' | 'filtered' | 'no_binomial' }
export function processSpeciesTagged(raw) {
    if (!raw) return { dropped: 'empty_species' };
    raw = raw.replace(/-([A-Za-z][A-Za-z0-9 ]*)-/g, (_, n) => `'${n.trim()}'`);
    raw = raw.replace(/ -[A-Za-z].*/g, '');
    const upper = raw.trim().replace(/\s+/g, ' ').toUpperCase();
    if (_filterSet.has(upper) || _filterPatterns.some(p => p.test(upper))) return { dropped: 'filtered' };
    const corrected = applyBinomialCorrections(upper);
    const species_binomial = extractSpeciesBinomial(corrected);
    if (!species_binomial) return { dropped: 'no_binomial' };
    return { species_binomial, species_cultivar: extractSpeciesCultivar(corrected) };
}


// Rank markers that indicate a subspecies / variety / forma — not a cultivar.
export const RANK_MARKERS = new Set([
    'SUBSP.', 'SUBSP', 'VAR.', 'VAR', 'F.', 'CV.', 'CV*', 'CV',
    'SPEC.', 'SPEC', 'SPECIES',
]);

export function extractSpeciesBinomial(s) {
    if (!s) return null;
    s = s.replace(/["`]/g, "'");           // normalize non-standard cultivar quote chars before stripping
    s = s.replace(/'.*$/, '').replace(/\(.*$/, '').trim();
    s = s.replace(/\s+(SUBSP\.|SUBSP|VAR\.|VAR|F\.|CV\.|CV\*|CV|SPEC\.|SPEC|SPECIES)(\s|$).*/i, '').trim();
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;
    if (words.length === 1) return words[0];
    // '×' (U+00D7) and plain 'X' both indicate a hybrid nothospecies
    if ((words[1] === '×' || words[1] === 'X') && words[2]) return `${words[0]} × ${words[2]}`;
    return `${words[0]} ${words[1]}`;
}

export function extractSpeciesCultivar(s) {
    if (!s) return null;
    s = s.replace(/["`]/g, "'");           // normalize non-standard cultivar quote chars before matching
    // Case 1: ICNCP code in parentheses ('CODE')
    const icncp = s.match(/\('([^')]+)'\)?/);
    if (icncp) return icncp[1].trim() || null;
    // Case 2: quoted cultivar name 'NAME'
    const quoted = s.match(/'([^']+)'/);
    if (quoted) return quoted[1].trim() || null;
    // Case 3: words after the binomial that aren't rank markers
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
