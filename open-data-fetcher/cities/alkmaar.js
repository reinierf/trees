import { processSpeciesTagged } from '../lib/species.js';

const WFS_URL  = 'https://datalab.alkmaar.nl/geoserver/Alkmaar/wfs';
const LAYER    = 'Alkmaar:Bomen';

function toTree(feature) {
    if (!feature?.properties) return { dropped: 'invalid_record' };
    const p      = feature.properties;
    const coords = feature.geometry?.coordinates; // GeoJSON: [lon, lat]

    const rawSpecies = (p.latnaam ?? '').trim();
    const speciesResult = processSpeciesTagged(rawSpecies);
    if (speciesResult.dropped) return speciesResult;

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

    keysetPaging: true,

    pageParams(layer, count, lastId) {
        const p = {
            service: 'WFS', version: '2.0.0', request: 'GetFeature',
            typeNames: layer, outputFormat: 'application/json', srsName: 'EPSG:4326',
            sortBy: 'boomnr',
            count: String(count),
        };
        if (lastId != null) p.CQL_FILTER = `boomnr>${lastId}`;
        return new URLSearchParams(p);
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
        const trees = [];
        const dropped = {};
        for (const r of features.map(f => toTree(f))) {
            if (r?.dropped) { dropped[r.dropped] = (dropped[r.dropped] ?? 0) + 1; }
            else if (r) trees.push(r);
        }
        return { trees, rawCount: features.length, dropped };
    },

    async parseCount(raw) {
        const m = raw.match(/numberMatched="(\d+)"/);
        return m ? parseInt(m[1], 10) : 0;
    },
};
