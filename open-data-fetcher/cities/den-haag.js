import { extractSpeciesBinomial, extractSpeciesCultivar } from '../lib/species.js';

// ArcGIS MapServer query — layer 0 = Straatboom (street trees), 127k trees
const BASE_URL = 'https://geoservices.denhaag.nl/arcgis/rest/services'
    + '/V4_5_Natuur_en_milieu/Natuur_en_landschapsbeheer/MapServer/0/query';

// "50-75 cm" → 62.5, "< 20 cm" → 10, "> 75 cm" → null
function parseDiameterClass(s) {
    if (!s) return null;
    const range = s.match(/(\d+)\s*-\s*(\d+)/);
    if (range) return (parseInt(range[1], 10) + parseInt(range[2], 10)) / 2;
    const lt = s.match(/<\s*(\d+)/);
    if (lt) return parseInt(lt[1], 10) / 2;
    return null;
}

function toTree(feature, fetchYear) {
    const a = feature.attributes;
    const g = feature.geometry;
    if (!g?.x || !g?.y) return null;

    const rawSpecies = (a.BOOMSOORT_WETENSCHAPPELIJ ?? '').trim();
    if (!rawSpecies) return null;

    const upper = rawSpecies.toUpperCase().replace(/\s+/g, ' ');
    const species_binomial = extractSpeciesBinomial(upper);
    if (!species_binomial) return null;

    const age = a.LEEFTIJD;

    return {
        id:              String(a.BOOMNUMMER ?? a.ID ?? a.COUNTER),
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         rawSpecies,
        species_binomial,
        species_cultivar: extractSpeciesCultivar(upper),
        name_indigenous: a.BOOMSOORT_NEDERLANDS || null,
        year_planted:    age ? String(fetchYear - age) : null,
        genus:           null,
        neighbourhood:   a.BUURT || null,
        street:          a.STRAATNAAM || null,
        trunk_diameter:  parseDiameterClass(a.STAMDIAMETERKLASSE),
        crown_spread:    null,
        last_updated:    null,
    };
}

export default {
    name: 'den-haag',
    wfsUrl: BASE_URL,
    layer: null,
    outputFile: { json: 'bomen-den-haag.json', sqlite: 'bomen-den-haag.db' },
    // geoservices.denhaag.nl has an incomplete certificate chain
    fetchOptions: { rejectUnauthorized: false },

    pageParams(_layer, count, startIndex) {
        return new URLSearchParams({
            where: '1=1',
            outFields: 'BOOMNUMMER,ID,COUNTER,BOOMSOORT_WETENSCHAPPELIJ,BOOMSOORT_NEDERLANDS,'
                + 'BUURT,STRAATNAAM,LEEFTIJD,STAMDIAMETERKLASSE',
            f: 'json',
            outSR: '4326',
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
        const fetchYear = new Date().getFullYear();
        const trees = features.map(f => toTree(f, fetchYear)).filter(Boolean);
        return { trees, rawCount: features.length };
    },

    async parseCount(raw) {
        const json = JSON.parse(raw);
        if (json.error) throw new Error(`ArcGIS error ${json.error.code}: ${json.error.message}`);
        return json.count ?? 0;
    },
};
