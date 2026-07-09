import { processSpeciesTagged } from '../lib/species.js';

// ArcGIS MapServer query — layer 0 = Straatboom (street trees), 127k trees
const BASE_URL = 'https://geoservices.denhaag.nl/arcgis/rest/services'
    + '/V4_5_Natuur_en_milieu/Natuur_en_landschapsbeheer/MapServer/0/query';

// "50-75 cm" → 0.625, "< 20 cm" → 0.1, "> 75 cm" → null (result in metres)
function parseDiameterClass(s) {
    if (!s) return null;
    const range = s.match(/(\d+)\s*-\s*(\d+)/);
    if (range) return (parseInt(range[1], 10) + parseInt(range[2], 10)) / 2 / 100;
    const lt = s.match(/<\s*(\d+)/);
    if (lt) return parseInt(lt[1], 10) / 2 / 100;
    return null;
}

function toTree(feature, fetchYear) {
    const a = feature.attributes;
    const g = feature.geometry;
    if (!g?.x || !g?.y) return { dropped: 'no_geometry' };

    const rawSpecies = (a.BOOMSOORT_WETENSCHAPPELIJ ?? '').trim();
    const speciesResult = processSpeciesTagged(rawSpecies);
    if (speciesResult.dropped) return speciesResult;

    const age = a.LEEFTIJD;

    return {
        id:              String(a.COUNTER),
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: a.BOOMSOORT_NEDERLANDS || null,
        year_planted:    age ? String(fetchYear - age) : null,
        neighbourhood:   a.BUURT || null,
        street:          a.STRAATNAAM || null,
        trunk_diameter:  parseDiameterClass(a.STAMDIAMETERKLASSE),
        crown_spread:    null,
    };
}

export default {
    name: 'den-haag',
    wfsUrl: BASE_URL,
    layer: null,
    outputFile: { json: 'den-haag.json', sqlite: 'den-haag.db' },
    // geoservices.denhaag.nl has an incomplete certificate chain
    fetchOptions: { rejectUnauthorized: false },

    keysetPaging: true,

    pageParams(_layer, count, lastId) {
        return new URLSearchParams({
            where:             lastId != null ? `COUNTER > ${lastId}` : '1=1',
            outFields:         'COUNTER,BOOMSOORT_WETENSCHAPPELIJ,BOOMSOORT_NEDERLANDS,'
                             + 'BUURT,STRAATNAAM,LEEFTIJD,STAMDIAMETERKLASSE',
            orderByFields:     'COUNTER ASC',
            f:                 'json',
            outSR:             '4326',
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
        const fetchYear = new Date().getFullYear();
        const trees = [];
        const dropped = {};
        for (const r of features.map(f => toTree(f, fetchYear))) {
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
