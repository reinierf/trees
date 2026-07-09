import { processSpeciesTagged } from '../lib/species.js';

const WFS_URL = 'https://maps.groningen.nl/geoserver/geo-data/ows';
const LAYER   = 'geo-data:Bomen gemeente Groningen';

const PROPERTY_NAMES = 'GEOM,OBJECT,STRAAT,BUURT,BOOMSOORT,LATIJNSE_NAAM,KIEMJAAR';

function toTree(feature) {
    if (!feature?.properties) return null;
    const p      = feature.properties;
    const coords = feature.geometry?.coordinates; // GeoJSON: [lon, lat]

    const tree = {
        id:            String(p.OBJECT ?? ''),
        street:        p.STRAAT        || null,
        neighbourhood: p.BUURT         || null,
        name_vernacular: p.BOOMSOORT   || null,
        species:       p.LATIJNSE_NAAM || null,
        year_planted:  p.KIEMJAAR      || null,
        trunk_diameter: null,
        crown_spread:   null,
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

    keysetPaging: true,

    pageParams(layer, count, lastId) {
        const p = {
            service: 'WFS', version: '1.0.0', request: 'GetFeature',
            typeName: layer, maxFeatures: String(count),
            sortBy: 'OBJECT',
            outputFormat: 'application/json', srsName: 'EPSG:4326',
            PROPERTYNAME: PROPERTY_NAMES,
        };
        if (lastId != null) p.CQL_FILTER = `OBJECT>${lastId}`;
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
