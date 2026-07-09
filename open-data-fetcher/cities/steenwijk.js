import { processSpeciesTagged } from '../lib/species.js';

const WFS_URL = 'https://infoopkaart.steenwijkerland.nl/geoserver/ows';
const LAYER   = 'nsm:gd_boom';

function toTree(feature) {
    if (!feature?.properties) return { dropped: 'invalid_record' };
    if (!feature.geometry?.coordinates) return { dropped: 'no_geometry' };
    const p      = feature.properties;
    const [lon, lat] = feature.geometry.coordinates;

    const rawSpecies = (p.latboomsoort ?? '').trim();
    const speciesResult = processSpeciesTagged(rawSpecies);
    if (speciesResult.dropped) return speciesResult;

    // openbare_ruimte format: "StreetName - PlaceName" — strip the place suffix
    const road = p.openbare_ruimte ?? '';
    const dashIdx = road.lastIndexOf(' - ');
    const street = dashIdx > 0 ? road.slice(0, dashIdx).trim() || null : road.trim() || null;

    const year = p.aanlegjaar && p.aanlegjaar > 1800 ? String(p.aanlegjaar) : null;

    return {
        id:             String(p.id),
        lat:            +parseFloat(lat).toFixed(7),
        lon:            +parseFloat(lon).toFixed(7),
        species:        rawSpecies,
        ...speciesResult,
        name_vernacular: null,
        year_planted:   year,
        neighbourhood:  p.woonplaats || null,
        street,
        trunk_diameter: null,
        crown_spread:   null,
    };
}

export default {
    name: 'steenwijk',
    wfsUrl: WFS_URL,
    layer: LAYER,
    outputFile: { json: 'steenwijk.json', sqlite: 'steenwijk.db' },
    fetchOptions: { rejectUnauthorized: false },

    keysetPaging: true,

    pageParams(layer, count, lastId) {
        const p = {
            SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature',
            TYPENAMES: layer, COUNT: String(count),
            SORTBY: 'id',
            OUTPUTFORMAT: 'application/json', SRSNAME: 'EPSG:4326',
        };
        if (lastId != null) p.CQL_FILTER = `id>${lastId}`;
        return new URLSearchParams(p);
    },

    countParams(layer) {
        return new URLSearchParams({
            SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature',
            TYPENAMES: layer, resultType: 'hits',
        });
    },

    async parse(raw) {
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

    parseCount(raw) {
        const m = raw.match(/numberMatched="(\d+)"/);
        return m ? parseInt(m[1], 10) : 0;
    },
};
