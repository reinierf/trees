import { processSpeciesTagged } from '../lib/species.js';

const WFS_URL = 'https://kaartviewer.maastricht.nl/geoserver/maastricht/ows';
const LAYER   = 'maastricht:Bomen';

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

    keysetPaging: true,

    // Keyset pagination: filter by ID > lastId instead of using startIndex.
    // GeoServer's offset pagination times out at ~99500 because it must sort all rows
    // before skipping; keyset lets it use the ID index and runs in constant time.
    pageParams(layer, count, lastId) {
        const p = {
            service: 'WFS', version: '1.0.0', request: 'GetFeature',
            typeName: layer, maxFeatures: String(count),
            sortBy: 'ID',
            outputFormat: 'application/json', srsName: 'EPSG:4326',
        };
        if (lastId != null) p.CQL_FILTER = `ID>${lastId}`;
        return new URLSearchParams(p);
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
        const trees = [];
        const dropped = {};
        for (const feature of features) {
            const raw = toTree(feature);
            if (!raw) { dropped.invalid_record = (dropped.invalid_record ?? 0) + 1; continue; }
            const speciesResult = processSpeciesTagged(raw.species);
            if (speciesResult.dropped) { dropped[speciesResult.dropped] = (dropped[speciesResult.dropped] ?? 0) + 1; continue; }
            Object.assign(raw, speciesResult);
            trees.push(raw);
        }
        return { trees, rawCount: features.length, dropped };
    },

    async parseCount(raw) {
        return JSON.parse(raw).totalFeatures ?? 0;
    },
};
