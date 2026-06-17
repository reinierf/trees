import { processSpecies } from '../lib/species.js';

const WFS_URL = 'https://kaartviewer.maastricht.nl/geoserver/maastricht/ows';
const LAYER   = 'maastricht:Bomen';

function sanitiseTree(tree) {
    if (!tree) return null;
    const result = processSpecies(tree.species);
    if (!result) return null;
    Object.assign(tree, result);
    return tree;
}

function toTree(feature) {
    if (!feature?.properties) return null;
    const p      = feature.properties;
    const coords = feature.geometry?.coordinates; // GeoJSON: [lon, lat]

    const yearRaw = p.AANLEGJAAR;
    const year    = yearRaw && yearRaw > 1800 ? String(yearRaw) : null;

    const diamCm   = p.DIAMETER;
    const diameter = diamCm ? diamCm / 100 : null;

    // Source uses "dummy_groen*" as placeholder street names for untracted locations
    const street = p.STRAAT && !p.STRAAT.startsWith('dummy_groen') ? p.STRAAT : null;

    const tree = {
        id:             String(p.ID ?? ''),
        street,
        neighbourhood:  null,
        name_vernacular: null,
        species:        p.BOOMSORTIM || null,
        year_planted:   year,
        trunk_diameter: diameter,
        crown_spread:   null,
    };

    if (Array.isArray(coords) && coords.length >= 2) {
        tree.lon = +parseFloat(coords[0]).toFixed(7);
        tree.lat = +parseFloat(coords[1]).toFixed(7);
    }

    return tree;
}

export default {
    name: 'maastricht',
    wfsUrl: WFS_URL,
    layer: LAYER,
    outputFile: { json: 'maastricht.json', sqlite: 'maastricht.db' },
    fetchOptions: { rejectUnauthorized: false },

    pageParams(layer, count, startIndex) {
        return new URLSearchParams({
            service: 'WFS', version: '1.0.0', request: 'GetFeature',
            typeName: layer, maxFeatures: String(count), startIndex: String(startIndex),
            // sortBy required for GeoServer to honour startIndex (needs stable ordering)
            sortBy: 'ID',
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
