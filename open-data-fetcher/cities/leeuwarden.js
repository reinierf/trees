import { processSpecies } from '../lib/species.js';

// ArcGIS FeatureServer — lelan_monumentale_waardevolle_bomen_punt (~878 trees)
// Full inventory is not public; this covers monumental and valuable trees only.
const BASE_URL = 'https://services3.arcgis.com/fHFI5v2gmYsUxbYF/arcgis/rest/services'
    + '/lelan_monumentale_waardevolle_bomen_punt/FeatureServer/0/query';

function toTree(feature) {
    const a = feature.attributes;
    const g = feature.geometry;
    if (!g?.x || !g?.y) return null;

    const rawSpecies = (a.LATBOOMSOO ?? '').trim();
    const speciesResult = processSpecies(rawSpecies);
    if (!speciesResult) return null;

    const diamCm = a.DIAMETER != null ? parseFloat(a.DIAMETER) : null;

    return {
        id:              String(a.OBJECT_GUI ?? a.FID),
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: a.NEDBOOMSOO || null,
        year_planted:    a.AANLEGJAAR ? String(a.AANLEGJAAR) : null,
        neighbourhood:   a.BUURT || null,
        street:          a.OPENBARE_R || null,
        trunk_diameter:  diamCm != null && !Number.isNaN(diamCm) ? diamCm / 100 : null,
        crown_spread:    null,
    };
}

export default {
    name: 'leeuwarden',
    wfsUrl: BASE_URL,
    layer: null,
    outputFile: { json: 'leeuwarden.json', sqlite: 'leeuwarden.db' },

    pageParams(_layer, count, startIndex) {
        return new URLSearchParams({
            where:             '1=1',
            outFields:         'FID,OBJECT_GUI,LATBOOMSOO,NEDBOOMSOO,DIAMETER,AANLEGJAAR,BUURT,OPENBARE_R',
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
        const trees = features.map(f => toTree(f)).filter(Boolean);
        return { trees, rawCount: features.length };
    },

    async parseCount(raw) {
        const json = JSON.parse(raw);
        if (json.error) throw new Error(`ArcGIS error ${json.error.code}: ${json.error.message}`);
        return json.count ?? 0;
    },
};
