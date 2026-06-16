import { processSpecies } from '../lib/species.js';

const BASE_URL = 'https://geoportaaloss.oss.nl/arcgis/rest/services/Dataportaal/Bomen/MapServer/1/query';

const OUT_FIELDS = 'OBJECTID,WETENSCHAPPELIJKE_NAAM,NEDERLANDSE_NAAM,AANLEGJAAR,WIJK,BUURT';

function toTree(feature) {
    const a = feature.attributes;
    const g = feature.geometry;
    if (!g?.x || !g?.y) return null;

    const rawSpecies = (a.WETENSCHAPPELIJKE_NAAM ?? '').trim();
    const speciesResult = processSpecies(rawSpecies);
    if (!speciesResult) return null;

    return {
        id:              String(a.OBJECTID),
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: a.NEDERLANDSE_NAAM || null,
        year_planted:    a.AANLEGJAAR || null,
        neighbourhood:   a.BUURT || a.WIJK || null,
        street:          null,
        trunk_diameter:  null,
        crown_spread:    null,
    };
}

export default {
    name: 'oss',
    wfsUrl: BASE_URL,
    layer: null,
    outputFile: { json: 'oss.json', sqlite: 'oss.db' },
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
