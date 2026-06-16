import { processSpecies } from '../lib/species.js';

const BASE_URL = 'https://gisservices.zwolle.nl/ArcGIS/rest/services/BOR_groen_wegen/FeatureServer/2/query';

const OUT_FIELDS = 'OBJECTID,BOOMSORTIMENT,NAAMNL,AANLEGJAAR,STRAATNAAM,BUURT,DIAMETER';

// NAAMNL comes from the source in ALL CAPS; convert to Title Case for display.
function toTitleCase(s) {
    if (!s) return null;
    return s.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase());
}

function toTree(feature) {
    const a = feature.attributes;
    const g = feature.geometry;
    if (!g?.x || !g?.y) return null;

    const rawSpecies = (a.BOOMSORTIMENT ?? '').trim();
    const speciesResult = processSpecies(rawSpecies);
    if (!speciesResult) return null;

    const aanlegjaar = a.AANLEGJAAR != null ? parseInt(a.AANLEGJAAR, 10) : null;

    return {
        id:              String(a.OBJECTID),
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: toTitleCase(a.NAAMNL),
        year_planted:    aanlegjaar ? String(aanlegjaar) : null,
        neighbourhood:   a.BUURT || null,
        street:          a.STRAATNAAM || null,
        trunk_diameter:  a.DIAMETER != null ? a.DIAMETER / 100 : null,
        crown_spread:    null,
    };
}

export default {
    name: 'zwolle',
    wfsUrl: BASE_URL,
    layer: null,
    outputFile: { json: 'zwolle.json', sqlite: 'zwolle.db' },
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
