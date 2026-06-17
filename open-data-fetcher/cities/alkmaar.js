import { processSpecies } from '../lib/species.js';

const WFS_URL  = 'https://datalab.alkmaar.nl/geoserver/Alkmaar/wfs';
const LAYER    = 'Alkmaar:Bomen';

function toTree(feature) {
    if (!feature?.properties) return null;
    const p      = feature.properties;
    const coords = feature.geometry?.coordinates; // GeoJSON: [lon, lat]

    const rawSpecies = (p.latnaam ?? '').trim();
    const speciesResult = processSpecies(rawSpecies);
    if (!speciesResult) return null;

    const tree = {
        id:              String(p.boomnr ?? ''),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: p.nednaam || null,
        year_planted:    p.plantjaar != null ? String(p.plantjaar) : null,
        neighbourhood:   p.buurt || null,
        street:          null,
        trunk_diameter:  null,
        crown_spread:    null,
    };

    if (Array.isArray(coords) && coords.length >= 2) {
        tree.lon = +parseFloat(coords[0]).toFixed(7);
        tree.lat = +parseFloat(coords[1]).toFixed(7);
    }

    return tree;
}

export default {
    name: 'alkmaar',
    wfsUrl: WFS_URL,
    layer: LAYER,
    outputFile: { json: 'alkmaar.json', sqlite: 'alkmaar.db' },
    fetchOptions: { rejectUnauthorized: false },

    pageParams(layer, count, startIndex) {
        return new URLSearchParams({
            service: 'WFS', version: '2.0.0', request: 'GetFeature',
            typeNames: layer, outputFormat: 'application/json', srsName: 'EPSG:4326',
            sortBy: 'boomnr',
            count: String(count), startIndex: String(startIndex),
        });
    },

    countParams(layer) {
        return new URLSearchParams({
            service: 'WFS', version: '2.0.0', request: 'GetFeature',
            typeNames: layer, resultType: 'hits',
        });
    },

    async parse(raw, _layer) {
        const geojson = JSON.parse(raw);
        if (geojson.exceptions || geojson.type === 'ExceptionReport') {
            throw new Error(`WFS exception: ${JSON.stringify(geojson)}`);
        }
        const features = geojson.features ?? [];
        const trees = features.map(f => toTree(f)).filter(Boolean);
        return { trees, rawCount: features.length };
    },

    async parseCount(raw) {
        const m = raw.match(/numberMatched="(\d+)"/);
        return m ? parseInt(m[1], 10) : 0;
    },
};
