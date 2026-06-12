import { processSpecies, applyIndigenousOverride } from '../lib/species.js';

const WFS_URL = 'https://maps.groningen.nl/geoserver/geo-data/ows';
const LAYER   = 'geo-data:Bomen gemeente Groningen';

function sanitiseTree(tree) {
    if (!tree) return null;
    const result = processSpecies(tree.species);
    if (!result) return null;
    Object.assign(tree, result);
    tree.name_indigenous = applyIndigenousOverride(tree.species_binomial, tree.name_indigenous);
    return tree;
}

function toTree(feature) {
    if (!feature?.properties) return null;
    const p      = feature.properties;
    const coords = feature.geometry?.coordinates; // GeoJSON: [lon, lat]

    const tree = {
        id:            String(p.OBJECT ?? ''),
        street:        p.STRAAT        || null,
        neighbourhood: p.BUURT         || null,
        name_indigenous: p.BOOMSOORT   || null,
        species:       p.LATIJNSE_NAAM || null,
        year_planted:  p.KIEMJAAR      || null,
        trunk_diameter: null,
        crown_spread:   null,
        genus:          null,
        last_updated:   null,
    };

    if (Array.isArray(coords) && coords.length >= 2) {
        tree.lon = +parseFloat(coords[0]).toFixed(7);
        tree.lat = +parseFloat(coords[1]).toFixed(7);
    }

    return tree;
}

export default {
    name: 'groningen',
    wfsUrl: WFS_URL,
    layer: LAYER,
    outputFile: { json: 'groningen.json', sqlite: 'groningen.db' },
    // GeoServer has an incomplete certificate chain (common for Dutch municipal servers)
    fetchOptions: { rejectUnauthorized: false },

    pageParams(layer, count, startIndex) {
        return new URLSearchParams({
            service: 'WFS', version: '1.0.0', request: 'GetFeature',
            typeName: layer, maxFeatures: String(count), startIndex: String(startIndex),
            // sortBy is required for GeoServer to accept startIndex (needs an ordering key)
            sortBy: 'OBJECT',
            outputFormat: 'application/json', srsName: 'EPSG:4326',
        });
    },

    countParams(layer) {
        return new URLSearchParams({
            service: 'WFS', version: '1.0.0', request: 'GetFeature',
            typeName: layer, maxFeatures: '1',
            outputFormat: 'application/json', srsName: 'EPSG:4326',
        });
    },

    async parse(raw, _layer) {
        const geojson = JSON.parse(raw);
        if (geojson.exceptions || geojson.type === 'ExceptionReport') {
            throw new Error(`WFS exception: ${JSON.stringify(geojson)}`);
        }
        const features = geojson.features ?? [];
        const trees = features.map(f => sanitiseTree(toTree(f))).filter(Boolean);
        return { trees, rawCount: features.length };
    },

    async parseCount(raw) {
        return JSON.parse(raw).totalFeatures ?? 0;
    },
};
