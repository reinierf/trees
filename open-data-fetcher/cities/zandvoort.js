import { processSpeciesTagged } from '../lib/species.js';

const WFS_URL    = 'https://data.haarlem.nl/geoserver/wfs';
const TYPE_NAME  = 'gemeentehaarlem:bor_bomen';
// This dataset covers both Haarlem and Zandvoort (see cities/haarlem.js); filter to one.
const CQL_FILTER = "gemeente='Zandvoort' AND status='Bestaand'";

// "6 - 9" (metres) → 7.5
function parseRangeAverage(s) {
    if (!s) return null;
    const m = s.match(/(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)/);
    if (!m) return null;
    return (parseFloat(m[1].replace(',', '.')) + parseFloat(m[2].replace(',', '.'))) / 2;
}

function toTree(feature, fetchYear) {
    if (!feature?.properties) return { dropped: 'invalid_record' };
    const p      = feature.properties;
    const coords = feature.geometry?.coordinates; // GeoJSON: [lon, lat]

    const rawSpecies = (p.naam_lt ?? '').trim();
    const speciesResult = processSpeciesTagged(rawSpecies);
    if (speciesResult.dropped) return speciesResult;

    const age = p.leeftijd;
    const diameterCm = p.diameter != null ? parseFloat(String(p.diameter).replace(',', '.')) : null;

    const tree = {
        id:              String(p.id),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: null,
        year_planted:    age != null ? String(fetchYear - age) : null,
        neighbourhood:   null,
        street:          null,
        trunk_diameter:  diameterCm != null && !Number.isNaN(diameterCm) ? diameterCm / 100 : null,
        crown_spread:    parseRangeAverage(p.kroondiameter),
    };

    if (Array.isArray(coords) && coords.length >= 2) {
        tree.lon = +parseFloat(coords[0]).toFixed(7);
        tree.lat = +parseFloat(coords[1]).toFixed(7);
    }

    return tree;
}

export default {
    name: 'zandvoort',
    wfsUrl: WFS_URL,
    layer: null,
    outputFile: { json: 'zandvoort.json', sqlite: 'zandvoort.db' },
    fetchOptions: { rejectUnauthorized: false },

    keysetPaging: true,

    pageParams(_layer, count, lastId) {
        return new URLSearchParams({
            service: 'WFS', version: '2.0.0', request: 'GetFeature',
            typeNames: TYPE_NAME, outputFormat: 'application/json', srsName: 'EPSG:4326',
            CQL_FILTER: lastId != null ? `${CQL_FILTER} AND id>${lastId}` : CQL_FILTER,
            sortBy: 'id',
            count: String(count),
        });
    },

    countParams(_layer) {
        return new URLSearchParams({
            service: 'WFS', version: '2.0.0', request: 'GetFeature',
            typeNames: TYPE_NAME, CQL_FILTER, resultType: 'hits',
        });
    },

    async parse(raw, _layer) {
        const geojson = JSON.parse(raw);
        if (geojson.exceptions || geojson.type === 'ExceptionReport') {
            throw new Error(`WFS exception: ${JSON.stringify(geojson)}`);
        }
        const features  = geojson.features ?? [];
        const fetchYear = new Date().getFullYear();
        const trees = [];
        const dropped = {};
        for (const r of features.map(f => toTree(f, fetchYear))) {
            if (r?.dropped) { dropped[r.dropped] = (dropped[r.dropped] ?? 0) + 1; }
            else if (r) trees.push(r);
        }
        return { trees, rawCount: features.length, dropped };
    },

    // resultType=hits returns XML regardless of outputFormat, with the count in numberMatched.
    async parseCount(raw) {
        const m = raw.match(/numberMatched="(\d+)"/);
        return m ? parseInt(m[1], 10) : 0;
    },
};
