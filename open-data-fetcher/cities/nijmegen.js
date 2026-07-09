import { processSpeciesTagged } from '../lib/species.js';

const WFS_URL = 'https://services.nijmegen.nl/geoservices/extern_BOR_Groen/ows';
const LAYER   = 'extern_BOR_Groen:GRN_BOMEN';

const PROPERTY_NAMES = 'GEOMETRIE,ID,BOOMSOORT,PLANTJAAR,WIJKNAAM,STRAATNAAM,KROONDIAMETER';

function toTree(feature) {
    if (!feature?.properties) return null;
    const p      = feature.properties;
    const coords = feature.geometry?.coordinates; // GeoJSON: [lon, lat]

    const crown = p.KROONDIAMETER != null ? parseFloat(p.KROONDIAMETER) || null : null;

    const tree = {
        id:              String(p.ID ?? ''),
        species:         p.BOOMSOORT   || null,
        name_vernacular: null,
        year_planted:    p.PLANTJAAR != null ? String(p.PLANTJAAR) : null,
        neighbourhood:   p.WIJKNAAM   || null,
        street:          p.STRAATNAAM || null,
        trunk_diameter:  null,
        crown_spread:    crown,
    };

    if (Array.isArray(coords) && coords.length >= 2) {
        tree.lon = +parseFloat(coords[0]).toFixed(7);
        tree.lat = +parseFloat(coords[1]).toFixed(7);
    }

    return tree;
}

export default {
    name: 'nijmegen',
    wfsUrl: WFS_URL,
    layer: LAYER,
    outputFile: { json: 'nijmegen.json', sqlite: 'nijmegen.db' },
    fetchOptions: { rejectUnauthorized: false },

    keysetPaging: true,

    pageParams(layer, count, lastId) {
        const p = {
            service: 'WFS', version: '1.0.0', request: 'GetFeature',
            typeName: layer, maxFeatures: String(count),
            sortBy: 'ID',
            outputFormat: 'application/json', srsName: 'EPSG:4326',
            PROPERTYNAME: PROPERTY_NAMES,
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
