import { processSpeciesTagged } from '../lib/species.js';

const WFS_URL = 'https://geo.sudwestfryslan.nl/geoserver/ows';
const LAYER   = 'swf:gv_bomen_4326';

const PROPERTY_NAMES = 'id,soortnaam,soortnaam_ned,jaarvanaanleg,woonplaats,openbareruimte';

function toTree(feature) {
    if (!feature?.properties) return null;
    const p      = feature.properties;
    const coords = feature.geometry?.coordinates; // GeoJSON: [lon, lat]

    const tree = {
        id:              String(p.id ?? ''),
        street:          p.openbareruimte || null,
        neighbourhood:   p.woonplaats     || null,
        name_vernacular: p.soortnaam_ned  || null,
        species:         p.soortnaam      || null,
        year_planted:    p.jaarvanaanleg  ? String(p.jaarvanaanleg) : null,
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
    name: 'sudwest-fryslan',
    wfsUrl: WFS_URL,
    layer: LAYER,
    outputFile: { json: 'sudwest-fryslan.json', sqlite: 'sudwest-fryslan.db' },

    pageParams(layer, count, startIndex) {
        return new URLSearchParams({
            service: 'WFS', version: '2.0.0', request: 'GetFeature',
            TYPENAMES: layer,
            COUNT: String(count),
            STARTINDEX: String(startIndex),
            sortBy: 'id',
            outputFormat: 'application/json',
            PROPERTYNAME: PROPERTY_NAMES,
        });
    },

    countParams(layer) {
        return new URLSearchParams({
            service: 'WFS', version: '2.0.0', request: 'GetFeature',
            TYPENAMES: layer, COUNT: '1',
            outputFormat: 'application/json',
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
            const rec = toTree(feature);
            if (!rec) { dropped.invalid_record = (dropped.invalid_record ?? 0) + 1; continue; }
            const speciesResult = processSpeciesTagged(rec.species);
            if (speciesResult.dropped) { dropped[speciesResult.dropped] = (dropped[speciesResult.dropped] ?? 0) + 1; continue; }
            Object.assign(rec, speciesResult);
            trees.push(rec);
        }
        return { trees, rawCount: features.length, dropped };
    },

    async parseCount(raw) {
        return JSON.parse(raw).totalFeatures ?? 0;
    },
};
