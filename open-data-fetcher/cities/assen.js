import { processSpeciesTagged } from '../lib/species.js';

const BASE_URL = 'https://services1.arcgis.com/p5QhXC0i0sZjprM1/arcgis/rest/services/Dataset_Bomen_Assen/FeatureServer/0/query';

const OUT_FIELDS = 'OBJECTID,Boomnummer,Boomsoort,Plantjaar,Straatnaam,DBH,Datum_inspectie';

// The service holds one record per inspection round, so most trees appear twice (e.g. the
// 2020 and 2021 inspection of Boomnummer A000034, ~0.3 m apart, trunk 39 vs 40 cm, sometimes
// a corrected species). Trees are identified by Boomnummer and only the newest inspection is
// kept (postProcess). OBJECTID stays the paging key: it is numeric and unique per record.

function toTree(feature) {
    const a = feature.attributes;
    const g = feature.geometry;
    if (!g?.x || !g?.y) return { dropped: 'no_geometry' };

    const rawSpecies = (a.Boomsoort ?? '').trim();
    const speciesResult = processSpeciesTagged(rawSpecies);
    if (speciesResult.dropped) return speciesResult;

    return {
        id:              String(a.Boomnummer ?? a.OBJECTID),
        _objectId:       a.OBJECTID,
        _inspected:      a.Datum_inspectie ?? 0,
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: null,
        year_planted:    a.Plantjaar ? String(a.Plantjaar) : null,
        neighbourhood:   null,
        street:          a.Straatnaam || null,
        trunk_diameter:  a.DBH ?? null,
        crown_spread:    null,
    };
}

export default {
    name: 'assen',
    wfsUrl: BASE_URL,
    layer: null,
    outputFile: { json: 'assen.json', sqlite: 'assen.db' },
    fetchOptions: { rejectUnauthorized: false },

    keysetPaging: true,
    pageKey: (tree) => tree._objectId,

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

    postProcess(trees) {
        const newest = new Map();
        for (const t of trees) {
            const prev = newest.get(t.id);
            if (!prev || t._inspected > prev._inspected ||
                (t._inspected === prev._inspected && t._objectId > prev._objectId)) newest.set(t.id, t);
        }
        const kept = [...newest.values()];
        process.stderr.write(`[assen] Kept the newest inspection of ${kept.length} trees (${trees.length - kept.length} older inspection records dropped).\n`);
        return kept.map(({ _objectId, _inspected, ...tree }) => tree);
    },

    async parseCount(raw) {
        const json = JSON.parse(raw);
        if (json.error) throw new Error(`ArcGIS error ${json.error.code}: ${json.error.message}`);
        return json.count ?? 0;
    },
};
