import { processSpecies } from '../lib/species.js';

const BASE = 'https://services-eu1.arcgis.com/SMnoOtmU2UWf0vRp/arcgis/rest/services/Bomenkaart_update_2024/FeatureServer';

const OUT_FIELDS = 'OBJECTID,Boomnummer,Wetenschappelijke_naam,Nederlandse_naam,Plantjaar,Buurt';

function toTree(feature) {
    const a = feature.attributes;
    const g = feature.geometry;
    if (!g?.x || !g?.y) return null;

    const rawSpecies = (a.Wetenschappelijke_naam ?? '').trim();
    const speciesResult = processSpecies(rawSpecies);
    if (!speciesResult) return null;

    return {
        id:              String(a.Boomnummer ?? a.OBJECTID),
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: a.Nederlandse_naam || null,
        year_planted:    a.Plantjaar || null,
        neighbourhood:   a.Buurt || null,
        street:          null,
        trunk_diameter:  null,
        crown_spread:    null,
        genus:           null,
        last_updated:    null,
    };
}

export default {
    name: 'utrecht',
    wfsUrl: (layer) => `${BASE}/${layer}/query`,
    layers: ['0', '1'],
    layer: null,
    outputFile: { json: 'utrecht.json', sqlite: 'utrecht.db' },
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
