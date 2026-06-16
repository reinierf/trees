import { processSpecies } from '../lib/species.js';

const BASE_URL = 'https://services3.arcgis.com/j07voPd56xoB4c87/arcgis/rest/services/Bomen%20in%20beheer%20door%20gemeente%20Delft/FeatureServer/0/query';

const OUT_FIELDS = 'OBJECTID,BOOMSORTIMENT,AANLEGJAAR,BUURT,DIAMETER';

// Delft uses the literal token 'CV' as a placeholder for "has a cultivar,
// unspecified" (e.g. "Populus nigra 'CV'") rather than an actual name.
function stripUnspecifiedCultivarMarker(s) {
    return s.replace(/'CV'/gi, '').replace(/\s+/g, ' ').trim();
}

function toTree(feature) {
    const a = feature.attributes;
    const g = feature.geometry;
    if (!g?.x || !g?.y) return null;

    const rawSpecies = (a.BOOMSORTIMENT ?? '').trim();
    const speciesResult = processSpecies(stripUnspecifiedCultivarMarker(rawSpecies));
    if (!speciesResult) return null;

    return {
        id:              String(a.OBJECTID),
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: null,
        year_planted:    a.AANLEGJAAR != null ? String(a.AANLEGJAAR) : null,
        neighbourhood:   a.BUURT || null,
        street:          null,
        trunk_diameter:  a.DIAMETER != null ? a.DIAMETER / 100 : null,
        crown_spread:    null,
        genus:           null,
        last_updated:    null,
    };
}

export default {
    name: 'delft',
    wfsUrl: BASE_URL,
    layer: null,
    outputFile: { json: 'delft.json', sqlite: 'delft.db' },
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
