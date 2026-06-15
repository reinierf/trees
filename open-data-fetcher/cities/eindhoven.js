import { processSpecies } from '../lib/species.js';

const BASE_URL = 'https://gisservice.eindhoven.nl/arcgis/rest/services/GRN_Bomen/MapServer/0/query';

function toTree(feature) {
    const a = feature.attributes;
    const g = feature.geometry;
    if (!g?.x || !g?.y) return null;

    const rawSpecies = (a.BOOMSOORT ?? '').trim();
    const speciesResult = processSpecies(rawSpecies);
    if (!speciesResult) return null;

    return {
        id:              String(a.BOOMNUMMER ?? a.OBJECTID),
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: a.BOOMSOORT_NEDERLANDS || null,
        year_planted:    a.PLANTJAAR ? String(a.PLANTJAAR) : null,
        neighbourhood:   null,
        street:          null,
        trunk_diameter:  null,
        crown_spread:    null,
        genus:           null,
        last_updated:    null,
    };
}

export default {
    name: 'eindhoven',
    wfsUrl: BASE_URL,
    layer: null,
    outputFile: { json: 'eindhoven.json', sqlite: 'eindhoven.db' },
    fetchOptions: { rejectUnauthorized: false },

    pageParams(_layer, count, startIndex) {
        return new URLSearchParams({
            where: '1=1',
            outFields: 'OBJECTID,BOOMNUMMER,BOOMSOORT,BOOMSOORT_NEDERLANDS,PLANTJAAR',
            f: 'json',
            outSR: '4326',
            resultOffset:      String(startIndex),
            resultRecordCount: String(count),
        });
    },

    countParams(_layer) {
        return new URLSearchParams({ where: '1=1', returnCountOnly: 'true', f: 'json' });
    },

    async parse(raw, _layer) {
        const json = JSON.parse(raw);
        if (json.error) throw new Error(`ArcGIS error ${json.error.code}: ${json.error.message}`);
        const features = json.features ?? [];
        const trees = features.map(f => toTree(f)).filter(Boolean);
        return { trees, rawCount: features.length };
    },

    async parseCount(raw) {
        const json = JSON.parse(raw);
        if (json.error) throw new Error(`ArcGIS error ${json.error.code}: ${json.error.message}`);
        return json.count ?? 0;
    },
};
