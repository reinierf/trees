import { processSpecies } from '../lib/species.js';

// ArcGIS MapServer — layer 10 = Monumentale/Waardevolle bomen (~1,907 trees)
// Full inventory is not public; this layer covers protected and valuable trees only.
const BASE_URL = 'https://geoproxy.s-hertogenbosch.nl/ags_extern/rest/services'
    + '/Externvrij/Beschermde_bomen/MapServer/10/query';

function toTree(feature, fetchYear) {
    const a = feature.attributes;
    const g = feature.geometry;
    if (!g?.x || !g?.y) return null;

    const rawSpecies = (a.BOOMSOORT_WETENSCHAPPELIJK ?? '').trim();
    const speciesResult = processSpecies(rawSpecies);
    if (!speciesResult) return null;

    const age    = a.LEEFTIJD != null ? parseInt(a.LEEFTIJD, 10) : null;
    const diamCm = a.STAMDIAMETER != null ? parseFloat(a.STAMDIAMETER) : null;

    return {
        id:              String(a.NIEUWNR ?? a.OBJECTID),
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: null,
        year_planted:    age != null && !Number.isNaN(age) ? String(fetchYear - age) : null,
        neighbourhood:   null,
        street:          null,
        trunk_diameter:  diamCm != null && !Number.isNaN(diamCm) ? diamCm / 100 : null,
        crown_spread:    null,
    };
}

export default {
    name: 'den-bosch',
    wfsUrl: BASE_URL,
    layer: null,
    outputFile: { json: 'den-bosch.json', sqlite: 'den-bosch.db' },
    fetchOptions: { rejectUnauthorized: false },

    pageParams(_layer, count, startIndex) {
        return new URLSearchParams({
            where:             '1=1',
            outFields:         'OBJECTID,NIEUWNR,BOOMSOORT_WETENSCHAPPELIJK,LEEFTIJD,STAMDIAMETER',
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
        const features  = json.features ?? [];
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
