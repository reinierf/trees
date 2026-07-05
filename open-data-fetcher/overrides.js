// Raw species values (after uppercasing + whitespace normalisation) matched here.
//
// dropTerms   — tree record is dropped entirely (administrative notes, removed trees)
// unknownTerms — tree is kept but species_binomial is set to null (genuinely unknown species)

// Species values that result in the record being dropped entirely. 
export const dropTerms = [
  /\bVERWIJDERD/i,    // removed
  /\bNIET\b/i,        // not / no (administrative)
  /^N\.?V\.?T\.?$/i,  // n.v.t. / nvt — "not applicable" (Dutch)
  /^\d+\.?\d*$/,      // numeric junk values (e.g. "0.67")
  'ZODOETIEDANIE',    // placeholder/test value
  /\bAAA\b/i,         // test/placeholder
  /\bAA: BOOM\b/i,    // test/placeholder
  /\bORGANISATI/i,    // organisational note
];

// Species values that result in a null binomial but are not filtered out entirely. These are typically used when the species is genuinely unknown, but may also include some administrative placeholders that we want to keep for now (e.g. "fruit tree").
export const unknownTerms = [
  'NULL',
  'ONBEKEND',
  /\?/,              // any value containing ? = uncertain identification
  'NAME',
  'CONIFEREN',
  'CONIFEER',
  'OVERIG',
  'FRUIT',
  'FRUITBOOM',
  'FRUITBOMEN',
  'KNOTBOOM',
  'WW',
  'VRUCHTBOOM',
  'STANDAARDBOOM',
  /\b(DIVERS|DIVERSE|DIVERSEN)\b/i, // various (administrative) — word-bounded so it doesn't also catch "Diversifolia" or "biodiversiteit"
  /^SOORTNAAM /i,     // "species name: …" field label
  /^BOOM/i,           // "BOOM…" catch-all for field noise
  /\bAANPLANT/i,      // planting note
  /\bNIEUW/i,         // new (administrative note)
  /\bNADER/i,         // further/later (administrative note)
  /\bWEET\b/i,        // administrative
  /\bASSORTIMENT/i,   // assortment (administrative placeholder)
  'NOG INVULLEN',     // "still to fill in"
];
