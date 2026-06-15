import { processSpecies } from '../lib/species.js';

const BASE_URL = 'https://services.arcgis.com/emS4w7iyWEQiulAb/arcgis/rest/services'
    + '/amersfoort_gemeente_en_monumentale_bomen/FeatureServer/0/query';

const OUT_FIELDS = 'OBJECTID,GEOVISIA_ID,BOOMSOORT,NEDERLANDSE_NAAM,PLANTJAAR,BUURT,STRAATNAAM';

function toTree(feature) {
    const a = feature.attributes;
    const g = feature.geometry;
    if (!g?.x || !g?.y) return null;

    const rawSpecies = (a.BOOMSOORT ?? '').trim();
    const speciesResult = processSpecies(rawSpecies);
    if (!speciesResult) return null;

    return {
        id:              a.GEOVISIA_ID || String(a.OBJECTID),
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: a.NEDERLANDSE_NAAM || null,
        year_planted:    a.PLANTJAAR || null,
        neighbourhood:   a.BUURT || null,
        street:          a.STRAATNAAM || null,
        trunk_diameter:  null,
        crown_spread:    null,
        genus:           null,
        last_updated:    null,
    };
}

export default {
    name: 'amersfoort',
    wfsUrl: BASE_URL,
    layer: null,
    outputFile: { json: 'amersfoort.json', sqlite: 'amersfoort.db' },
    fetchOptions: { rejectUnauthorized: false },

    pageParams(_layer, count, startIndex) {
        return new URLSearchParams({
            where: '1=1',
            outFields: OUT_FIELDS,
            returnGeometry: 'true',
            outSR: '4326',
            f: 'json',
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
