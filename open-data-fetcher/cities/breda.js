import { processSpecies } from '../lib/species.js';

const BASE_URL = 'https://services-eu1.arcgis.com/SgHNk1qzR4I13Wum/arcgis/rest/services/Bomen/FeatureServer/0/query';

const OUT_FIELDS = 'OBJECTID,HB_ADM_boomnummer,HB_SRT_soortwet,HB_SRT_soortned';

function toTree(feature) {
    const a = feature.attributes;
    const g = feature.geometry;
    if (!g?.x || !g?.y) return null;

    const rawSpecies = (a.HB_SRT_soortwet ?? '').trim();
    const speciesResult = processSpecies(rawSpecies);
    if (!speciesResult) return null;

    return {
        id:              String(a.HB_ADM_boomnummer ?? a.OBJECTID),
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: a.HB_SRT_soortned || null,
        year_planted:    null,
        neighbourhood:   null,
        street:          null,
        trunk_diameter:  null,
        crown_spread:    null,
        genus:           null,
        last_updated:    null,
    };
}

export default {
    name: 'breda',
    wfsUrl: BASE_URL,
    layer: null,
    outputFile: { json: 'breda.json', sqlite: 'breda.db' },
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
