import { processSpeciesTagged } from '../lib/species.js';

const BASE_URL = 'https://geoportaaloss.oss.nl/arcgis/rest/services/Dataportaal/Bomen/MapServer/1/query';

const OUT_FIELDS = 'OBJECTID,WETENSCHAPPELIJKE_NAAM,NEDERLANDSE_NAAM,AANLEGJAAR,WIJK,BUURT';

function toTree(feature) {
    const a = feature.attributes;
    const g = feature.geometry;
    if (!g?.x || !g?.y) return { dropped: 'no_geometry' };

    const rawSpecies = (a.WETENSCHAPPELIJKE_NAAM ?? '').trim();
    const speciesResult = processSpeciesTagged(rawSpecies);
    if (speciesResult.dropped) return speciesResult;

    return {
        id:              String(a.OBJECTID),
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: a.NEDERLANDSE_NAAM || null,
        year_planted:    a.AANLEGJAAR || null,
        neighbourhood:   a.BUURT || a.WIJK || null,
        street:          null,
        trunk_diameter:  null,
        crown_spread:    null,
    };
}

export default {
    name: 'oss',
    wfsUrl: BASE_URL,
    layer: null,
    outputFile: { json: 'oss.json', sqlite: 'oss.db' },
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
