import { processSpeciesTagged } from '../lib/species.js';

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
    if (!g?.x || !g?.y) return { dropped: 'no_geometry' };

    const rawSpecies = (a.BOOMSORTIMENT ?? '').trim();
    const speciesResult = processSpeciesTagged(rawSpecies);
    if (speciesResult.dropped) return speciesResult;

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
