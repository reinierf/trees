import { processSpeciesTagged } from '../lib/species.js';

const BASE_URL = 'https://gisservice.eindhoven.nl/arcgis/rest/services/GRN_Bomen/MapServer/0/query';

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
        name_vernacular: a.BOOMSOORT_NEDERLANDS || null,
        year_planted:    a.PLANTJAAR ? String(a.PLANTJAAR) : null,
        neighbourhood:   null,
        street:          null,
        trunk_diameter:  null,
        crown_spread:    null,
    };
}

export default {
    name: 'eindhoven',
    wfsUrl: BASE_URL,
    layer: null,
    outputFile: { json: 'eindhoven.json', sqlite: 'eindhoven.db' },
    fetchOptions: { rejectUnauthorized: false },

    keysetPaging: true,

    pageParams(_layer, count, lastId) {
        return new URLSearchParams({
            where:             lastId != null ? `OBJECTID > ${lastId}` : '1=1',
            outFields:         'OBJECTID,BOOMNUMMER,BOOMSOORT,BOOMSOORT_NEDERLANDS,PLANTJAAR',
            f:                 'json',
            outSR:             '4326',
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
