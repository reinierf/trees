import { processSpecies } from '../lib/species.js';

const DATA_URL = 'https://openbomenkaart.org/data/trees_ridderkerk.json';

function toTree(element) {
    const t = element?.tags;
    if (!t || element.lat == null || element.lon == null) return null;

    const rawSpecies = (t.species ?? '').trim();
    const speciesResult = processSpecies(rawSpecies);
    if (!speciesResult) return null;

    const diameter = t.diameter != null ? parseFloat(String(t.diameter).replace('~', '').replace(',', '.')) : null;

    const lat = +parseFloat(element.lat).toFixed(7);
    const lon = +parseFloat(element.lon).toFixed(7);

    return {
        id:              `${lat}_${lon}`,
        lat,
        lon,
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: null,
        year_planted:    t.plantjaar && t.plantjaar !== '?' ? String(t.plantjaar) : null,
        neighbourhood:   null,
        street:          null,
        trunk_diameter:  diameter != null && !Number.isNaN(diameter) ? diameter : null,
        crown_spread:    null,
    };
}

export default {
    name: 'ridderkerk',
    wfsUrl: DATA_URL,
    layer: null,
    singleFetch: true,
    outputFile: { json: 'ridderkerk.json', sqlite: 'ridderkerk.db' },
    fetchOptions: { rejectUnauthorized: false },

    async parse(raw) {
        const elements = JSON.parse(raw).elements ?? [];
        const trees = elements.map(toTree).filter(Boolean);
        return { trees };
    },
};
