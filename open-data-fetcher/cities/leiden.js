import { processSpecies } from '../lib/species.js';

const DATA_URL = 'https://openbomenkaart.org/data/trees_leiden.json';

// The Leiden OBK export wraps cultivar names in dashes instead of single quotes
// (e.g. "Prunus -Pandora-" rather than "Prunus 'Pandora'"). Normalize before
// processSpecies() sees the string. Truncated forms with no closing dash
// (e.g. "Malus -Golden") have their cultivar hint stripped.
function normalizeLeidenSpecies(s) {
    s = s.replace(/-([A-Za-z][A-Za-z0-9 ]*)-/g, (_, n) => `'${n.trim()}'`);
    s = s.replace(/ -[A-Za-z].*/g, '');
    return s.trim();
}

function toTree(element, index) {
    const t = element?.tags;
    if (!t || element.lat == null || element.lon == null) return null;

    const rawSpecies = (t.species ?? '').trim();
    const speciesResult = processSpecies(normalizeLeidenSpecies(rawSpecies));

    // Keep trees whose species contains '?' — an explicit "unknown" marker in the
    // OBK data. Drop everything else that processSpecies can't resolve (numbers,
    // generic descriptors like "STANDAARDBOOM", etc.).
    if (!speciesResult && !rawSpecies.includes('?')) return null;

    const diameter = t.diameter != null ? parseFloat(String(t.diameter).replace('~', '').replace(',', '.')) : null;

    // OBK exports use 'planted' (Voorschoten, Albrandswaard) or 'plantjaar' (Barendrecht)
    const yearRaw = t.planted ?? t.plantjaar ?? null;

    // element.id is a positive OSM node id when real; 0 is a placeholder used by some exports
    const rawId = element.id > 0 ? element.id : t.admin_ref;
    const id = rawId != null && rawId !== '??' ? String(rawId) : String(index);

    return {
        id,
        lat:             +parseFloat(element.lat).toFixed(7),
        lon:             +parseFloat(element.lon).toFixed(7),
        species:         rawSpecies,
        ...(speciesResult ?? { species_binomial: null, species_cultivar: null }),
        name_vernacular: null,
        year_planted:    yearRaw && yearRaw !== '?' ? String(yearRaw) : null,
        neighbourhood:   null,
        street:          t.place || null,
        trunk_diameter:  diameter != null && !Number.isNaN(diameter) ? diameter : null,
        crown_spread:    null,
    };
}

export default {
    name: 'leiden',
    wfsUrl: DATA_URL,
    layer: null,
    singleFetch: true,
    outputFile: { json: 'leiden.json', sqlite: 'leiden.db' },
    fetchOptions: { rejectUnauthorized: false },

    async parse(raw) {
        const elements = JSON.parse(raw).elements ?? [];
        const trees = elements.map((e, i) => toTree(e, i)).filter(Boolean);
        return { trees };
    },
};
