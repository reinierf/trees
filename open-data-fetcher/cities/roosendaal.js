import { processSpecies } from '../lib/species.js';

// ArcGIS FeatureServer — 63k trees, paginated at 2000/page
const BASE_URL = 'https://services-eu1.arcgis.com/JxE7X5eyCPYNhczD/arcgis/rest/services'
    + '/Bomen_Gemeente_roosendaal/FeatureServer/0/query';

function toTree(feature) {
    const a = feature.attributes;
    const g = feature.geometry;
    if (!g?.x || !g?.y) return null;

    const rawSpecies = (a.soortnaam ?? '').trim();
    const speciesResult = processSpecies(rawSpecies);
    if (!speciesResult) return null;

    return {
        id:              String(a.OBJECTID),
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: null,
        year_planted:    a.jaar_van_aanleg ? String(a.jaar_van_aanleg).trim() : null,
        neighbourhood:   a.Buurtnaam || null,
        street:          a.Openbareruimte_naam || null,
        trunk_diameter:  null,
        crown_spread:    null,
    };
}

export default {
    name: 'roosendaal',
    wfsUrl: BASE_URL,
    layer: null,
    outputFile: { json: 'roosendaal.json', sqlite: 'roosendaal.db' },

    pageParams(_layer, count, startIndex) {
        return new URLSearchParams({
            where:             '1=1',
            outFields:         'OBJECTID,soortnaam,jaar_van_aanleg,Buurtnaam,Openbareruimte_naam',
            f:                 'json',
            outSR:             '4326',
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
        const trees = features.map(toTree).filter(Boolean);
        return { trees, rawCount: features.length };
    },

    async parseCount(raw) {
        const json = JSON.parse(raw);
        if (json.error) throw new Error(`ArcGIS error ${json.error.code}: ${json.error.message}`);
        return json.count ?? 0;
    },
};
