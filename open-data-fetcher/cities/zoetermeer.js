import { processSpecies } from '../lib/species.js';

// ArcGIS MapServer query — layer 0 = all trees
const BASE_URL = 'https://gis.zoetermeer.nl/arcgis/rest/services/Public/Bomen/MapServer/0/query';

function toTree(feature) {
    const a = feature.attributes;
    const g = feature.geometry;
    // Layer uses esriGeometryMultipoint: geometry.points = [[lon, lat]]
    const pt = g?.points?.[0];
    if (!pt) return null;
    const [lon, lat] = pt;

    const rawSpecies = (a.BMN_BOOMSOORT_LAT ?? '').trim();
    const speciesResult = processSpecies(rawSpecies);
    if (!speciesResult) return null;

    const year = a.BMN_PLANTJAAR ? String(a.BMN_PLANTJAAR).trim() : null;

    return {
        id:              String(a.OBJECTID),
        lat:             +parseFloat(lat).toFixed(7),
        lon:             +parseFloat(lon).toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: a.BMN_BOOMSOORT_NED || null,
        year_planted:    year || null,
        neighbourhood:   a.BMN_BUURT || null,
        street:          a.BMN_STRAAT || null,
        trunk_diameter:  null,
        crown_spread:    null,
    };
}

export default {
    name: 'zoetermeer',
    wfsUrl: BASE_URL,
    layer: null,
    keysetPaging: true,
    outputFile: { json: 'zoetermeer.json', sqlite: 'zoetermeer.db' },
    // incomplete certificate chain on gis.zoetermeer.nl
    fetchOptions: { rejectUnauthorized: false },

    pageParams(_layer, count, lastId) {
        return new URLSearchParams({
            where:         lastId != null ? `OBJECTID > ${lastId}` : '1=1',
            outFields:     'OBJECTID,BMN_BOOMSOORT_LAT,BMN_BOOMSOORT_NED,'
                         + 'BMN_PLANTJAAR,BMN_BUURT,BMN_STRAAT',
            orderByFields: 'OBJECTID ASC',
            f:             'json',
            outSR:         '4326',
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
