import { processSpeciesTagged } from '../lib/species.js';

const WFS_URL = 'https://api.data.amsterdam.nl/v1/wfs/bomen/';
const LAYER   = 'app:stamgegevens';

const PROPERTY_NAMES = 'geometrie,id,soortnaam,soortnaam_top,jaar_van_aanleg';

function extractIndigenous(s) {
    if (!s) return null;
    return s.replace(/\s*\([^)]+\)\s*$/, '').trim() || null;
}

function toTree(feature) {
    if (!feature?.properties) return null;
    const p = feature.properties;
    const coords = feature.geometry?.coordinates;

    const tree = {
        id:              String(p.id ?? ''),
        species:         p.soortnaam       || null,
        name_vernacular: extractIndigenous(p.soortnaam_top),
        year_planted:    p.jaar_van_aanleg || null,
        neighbourhood:   null,
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
    name: 'amsterdam',
    wfsUrl: WFS_URL,
    layer: LAYER,
    outputFile: { json: 'amsterdam.json', sqlite: 'amsterdam.db' },
    fetchOptions: { rejectUnauthorized: false },

    pageParams(layer, count, startIndex) {
        return new URLSearchParams({
            SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature',
            TYPENAMES: layer,
            OUTPUTFORMAT: 'geojson', SRSNAME: 'EPSG:4326',
            COUNT: String(count), STARTINDEX: String(startIndex),
            PROPERTYNAME: PROPERTY_NAMES,
        });
    },

    countParams(layer) {
        return new URLSearchParams({
            SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature',
            TYPENAMES: layer, resultType: 'hits',
        });
    },

    async parse(raw) {
        const geojson = JSON.parse(raw);
        if (geojson.type === 'ExceptionReport' || geojson.exceptions) {
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
        const m = raw.match(/numberMatched="(\d+)"/);
        return m ? parseInt(m[1], 10) : 0;
    },
};
