import { processSpeciesTagged } from '../lib/species.js';

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
    if (!g?.x || !g?.y) return { dropped: 'no_geometry' };

    const rawSpecies = (a.BOOMSOORT ?? '').trim();
    const speciesResult = processSpeciesTagged(rawSpecies);
    if (speciesResult.dropped) return speciesResult;

    return {
        id:              String(a.OBJECTID),
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

    keysetPaging: true,

    pageParams(_layer, count, lastId) {
        return new URLSearchParams({
            where:             lastId != null ? `OBJECTID > ${lastId}` : '1=1',
            outFields:         OUT_FIELDS,
            returnGeometry:    'true',
            outSR:             '4326',
            f:                 'json',
            orderByFields:     'OBJECTID ASC',
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
        const trees = [];
        const dropped = {};
        for (const r of features.map(f => toTree(f))) {
            if (r?.dropped) { dropped[r.dropped] = (dropped[r.dropped] ?? 0) + 1; }
            else if (r) trees.push(r);
        }
        return { trees, rawCount: features.length, dropped };
    },

    async parseCount(raw) {
        const json = JSON.parse(raw);
        if (json.error) throw new Error(`ArcGIS error ${json.error.code}: ${json.error.message}`);
        return json.count ?? 0;
    },
};
