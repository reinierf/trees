import { processSpecies } from '../lib/species.js';

const DATA_URL = 'https://openbomenkaart.org/data/trees_albrandswaard.json';

function toTree(element) {
    const t = element?.tags;
    if (!t || element.lat == null || element.lon == null) return null;

    const rawSpecies = (t.species ?? '').trim();
    const speciesResult = processSpecies(rawSpecies);
    if (!speciesResult) return null;

    const diameter = t.diameter != null ? parseFloat(String(t.diameter).replace('~', '').replace(',', '.')) : null;

    return {
        id:              String(t.admin_ref || element.id),
        lat:             +parseFloat(element.lat).toFixed(7),
        lon:             +parseFloat(element.lon).toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: null,
        year_planted:    t.planted && t.planted !== '?' ? t.planted : null,
        neighbourhood:   null,
        street:          t.place || null,
        trunk_diameter:  diameter != null && !Number.isNaN(diameter) ? diameter : null,
        crown_spread:    null,
    };
}

export default {
    name: 'albrandswaard',
    wfsUrl: DATA_URL,
    layer: null,
    singleFetch: true,
    outputFile: { json: 'albrandswaard.json', sqlite: 'albrandswaard.db' },
    fetchOptions: { rejectUnauthorized: false },

    async parse(raw) {
        const elements = JSON.parse(raw).elements ?? [];
        const trees = elements.map(toTree).filter(Boolean);
        return { trees };
    },
};
