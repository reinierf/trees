import { processSpecies } from '../lib/species.js';

const DATA_URL = 'https://openbomenkaart.org/data/trees_ede.json';

// OBK's Ede export contains a handful of points ~450km away near the French/Belgian
// border — a bad geocode, not a real tree. No Dutch municipality spans anywhere near
// this distance, so anything this far from the dataset's median coordinate gets dropped.
const MAX_DISTANCE_FROM_MEDIAN_DEG = 0.5;

function toTree(element, index) {
    const t = element?.tags;
    if (!t || element.lat == null || element.lon == null) return null;

    const rawSpecies = (t.species ?? '').trim();
    const speciesResult = processSpecies(rawSpecies);
    if (!speciesResult) return null;

    const diameter = t.diameter != null ? parseFloat(String(t.diameter).replace('~', '').replace(',', '.')) : null;
    const year = t.planted || t.plantjaar;

    return {
        id:              String(element.id > 0 ? element.id : (t.admin_ref || index)),
        lat:             +parseFloat(element.lat).toFixed(7),
        lon:             +parseFloat(element.lon).toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: null,
        year_planted:    year && year !== '?' ? String(year) : null,
        neighbourhood:   null,
        street:          t.place || null,
        trunk_diameter:  diameter != null && !Number.isNaN(diameter) ? diameter : null,
        crown_spread:    null,
    };
}

function median(nums) {
    const sorted = nums.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export default {
    name: 'ede',
    wfsUrl: DATA_URL,
    layer: null,
    singleFetch: true,
    outputFile: { json: 'ede.json', sqlite: 'ede.db' },
    fetchOptions: { rejectUnauthorized: false },

    async parse(raw) {
        const elements = JSON.parse(raw).elements ?? [];
        const parsed = elements.map((el, i) => toTree(el, i)).filter(Boolean);

        const medianLat = median(parsed.map((t) => t.lat));
        const medianLon = median(parsed.map((t) => t.lon));

        const trees = [];
        let outliers = 0;
        for (const t of parsed) {
            if (Math.hypot(t.lat - medianLat, t.lon - medianLon) > MAX_DISTANCE_FROM_MEDIAN_DEG) {
                outliers++;
                continue;
            }
            trees.push(t);
        }

        return { trees, dropped: outliers > 0 ? { outlier_coordinate: outliers } : undefined };
    },
};
