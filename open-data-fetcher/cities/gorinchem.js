import { processSpeciesTagged } from '../lib/species.js';

const WFS_URL   = 'https://geoportaal.gorinchem.nl/geoserver/data/wfs';
const TYPE_NAME = 'data:monumentale_beeldbepalende_bomen';

function toTree(feature) {
    if (!feature?.properties) return { dropped: 'invalid_record' };
    const p      = feature.properties;
    const coords = feature.geometry?.coordinates; // GeoJSON [lon, lat] in WGS84

    const rawSpecies = (p.wetensch_naam ?? '').trim();
    const speciesResult = processSpeciesTagged(rawSpecies);
    if (speciesResult.dropped) return speciesResult;

    const diameterCm = p.diameter != null ? parseFloat(String(p.diameter)) : null;

    const tree = {
        id:             String(p.elementnummer ?? p.id),
        species:        rawSpecies,
        ...speciesResult,
        name_vernacular: p.boomsoort || null,
        year_planted:    p.aanlegjaar != null ? String(p.aanlegjaar) : null,
        neighbourhood:   p.wijk   || null,
        street:          p.straat || null,
        trunk_diameter:  diameterCm != null && !Number.isNaN(diameterCm) ? diameterCm / 100 : null,
        crown_spread:    null,
    };

    if (Array.isArray(coords) && coords.length >= 2) {
        tree.lon = +parseFloat(coords[0]).toFixed(7);
        tree.lat = +parseFloat(coords[1]).toFixed(7);
    }

    return tree;
}

export default {
    name: 'gorinchem',
    wfsUrl: WFS_URL,
    layer: null,
    outputFile: { json: 'gorinchem.json', sqlite: 'gorinchem.db' },
    fetchOptions: { rejectUnauthorized: false },

    keysetPaging: true,

    pageParams(_layer, count, lastId) {
        const p = {
            service: 'WFS', version: '2.0.0', request: 'GetFeature',
            typeNames: TYPE_NAME, outputFormat: 'application/json',
            srsName: 'urn:ogc:def:crs:EPSG::4326',
            sortBy: 'elementnummer',
            count: String(count),
        };
        if (lastId != null) p.CQL_FILTER = `elementnummer>${lastId}`;
        return new URLSearchParams(p);
    },

    countParams(_layer) {
        return new URLSearchParams({
            service: 'WFS', version: '2.0.0', request: 'GetFeature',
            typeNames: TYPE_NAME, resultType: 'hits',
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
        for (const r of features.map(toTree)) {
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
