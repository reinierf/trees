// Rank markers that indicate a subspecies / variety / forma — not a cultivar.
export const RANK_MARKERS = new Set([
    'SUBSP.', 'SUBSP', 'VAR.', 'VAR', 'F.', 'CV.', 'CV*', 'CV',
]);

export function extractSpeciesBinomial(s) {
    if (!s) return null;
    s = s.replace(/'.*$/, '').replace(/\(.*$/, '').trim();
    s = s.replace(/\s+(SUBSP\.|SUBSP|VAR\.|VAR|F\.|CV\.|CV\*|CV)(\s|$).*/i, '').trim();
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;
    if (words.length === 1) return words[0];
    // '×' (U+00D7) and plain 'X' both indicate a hybrid nothospecies
    if ((words[1] === '×' || words[1] === 'X') && words[2]) return `${words[0]} × ${words[2]}`;
    return `${words[0]} ${words[1]}`;
}

export function extractSpeciesCultivar(s) {
    if (!s) return null;
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
