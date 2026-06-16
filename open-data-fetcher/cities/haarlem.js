import { processSpecies } from '../lib/species.js';

const WFS_URL    = 'https://data.haarlem.nl/geoserver/wfs';
const TYPE_NAME  = 'gemeentehaarlem:bor_bomen';
// This dataset covers both Haarlem and Zandvoort (see cities/zandvoort.js); filter to one.
const CQL_FILTER = "gemeente='Haarlem' AND status='Bestaand'";

// "6 - 9" (metres) → 7.5
function parseRangeAverage(s) {
    if (!s) return null;
    const m = s.match(/(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)/);
    if (!m) return null;
    return (parseFloat(m[1].replace(',', '.')) + parseFloat(m[2].replace(',', '.'))) / 2;
}

function toTree(feature, fetchYear) {
    if (!feature?.properties) return null;
    const p      = feature.properties;
    const coords = feature.geometry?.coordinates; // GeoJSON: [lon, lat]

    const rawSpecies = (p.naam_lt ?? '').trim();
    const speciesResult = processSpecies(rawSpecies);
    if (!speciesResult) return null;

    const age = p.leeftijd;
    const diameterCm = p.diameter != null ? parseFloat(String(p.diameter).replace(',', '.')) : null;

    const tree = {
        id:              String(p.boomnummer ?? p.id),
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
    name: 'haarlem',
    wfsUrl: WFS_URL,
    layer: null,
    outputFile: { json: 'haarlem.json', sqlite: 'haarlem.db' },
    fetchOptions: { rejectUnauthorized: false },

    pageParams(_layer, count, startIndex) {
        return new URLSearchParams({
            service: 'WFS', version: '2.0.0', request: 'GetFeature',
            typeNames: TYPE_NAME, outputFormat: 'application/json', srsName: 'EPSG:4326',
            CQL_FILTER, sortBy: 'id',
            count: String(count), startIndex: String(startIndex),
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
        const trees = features.map(f => toTree(f, fetchYear)).filter(Boolean);
        return { trees, rawCount: features.length };
    },

    // resultType=hits returns XML regardless of outputFormat, with the count in numberMatched.
    async parseCount(raw) {
        const m = raw.match(/numberMatched="(\d+)"/);
        return m ? parseInt(m[1], 10) : 0;
    },
};
