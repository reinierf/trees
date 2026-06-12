// Literal-match corrections applied to the raw species field (after uppercasing).
// Matched case-insensitively and replaced everywhere in the string.
export const binomialCorrections = {
    'METASQUOIA':    'METASEQUOIA',   // Rotterdam typo
    'PTEROCAYRA':    'PTEROCARYA',    // Rotterdam typo
    'HIBISCUS SYR.': 'HIBISCUS SYRIACUS', // Rotterdam abbreviation
    'ELKOVA': 'ZELKOVA', // Groningen typo
};

// Raw species values (after uppercasing + whitespace normalisation) that are
// administrative notes or categories rather than real taxa — records are dropped.
export const filterSpecies = [
    'VERWIJDERD',
    'ASSORTIMENT ONBEKEND',
    'CONIFEREN',
    'OVERIG',
    'NIET (REGULIER) INBOETEN',
];

// Canonical binomial (uppercase) → preferred Dutch common name.
// Applied last, overriding whatever indigenous name came from the source.
export const indigenousNameOverrides = {
    'QUERCUS ROBUR': 'Zomereik',
};
