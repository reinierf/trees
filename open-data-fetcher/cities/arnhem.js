import { processSpecies } from '../lib/species.js';

const BASE_URL = 'https://geo.arnhem.nl/arcgis/rest/services/OpenData/Bomenkaart/MapServer/0/query';

const OUT_FIELDS = 'OBJECTID,BOOMNUMMER,BOOMSOORT,NEDERLANDSE_NAAM,PLANTJAAR,BUURTNAAM,STRAATNAAM,STAMDIAMETERKLASSE';

// "100 tot 150 cm" → 1.25, "< 20 cm" → 0.1 (result in metres)
function parseDiameterClass(s) {
    if (!s) return null;
    const range = s.match(/(\d+)\s+tot\s+(\d+)/i);
    if (range) return (parseInt(range[1], 10) + parseInt(range[2], 10)) / 2 / 100;
    const lt = s.match(/<\s*(\d+)/);
    if (lt) return parseInt(lt[1], 10) / 2 / 100;
    return null;
}

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
        name_vernacular: a.NEDERLANDSE_NAAM || null,
        year_planted:    a.PLANTJAAR ? String(a.PLANTJAAR) : null,
        neighbourhood:   a.BUURTNAAM || null,
        street:          a.STRAATNAAM || null,
        trunk_diameter:  parseDiameterClass(a.STAMDIAMETERKLASSE),
        crown_spread:    null,
    };
}

export default {
    name: 'arnhem',
    wfsUrl: BASE_URL,
    layer: null,
    outputFile: { json: 'arnhem.json', sqlite: 'arnhem.db' },
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
