import { processSpecies } from '../lib/species.js';

const WFS_URL = 'https://infoopkaart.steenwijkerland.nl/geoserver/ows';
const LAYER   = 'nsm:gd_boom';

function toTree(feature) {
    if (!feature?.properties || !feature.geometry?.coordinates) return null;
    const p      = feature.properties;
    const [lon, lat] = feature.geometry.coordinates;

    const rawSpecies = (p.latboomsoort ?? '').trim();
    const speciesResult = processSpecies(rawSpecies);
    if (!speciesResult) return null;

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

    pageParams(layer, count, startIndex) {
        return new URLSearchParams({
            SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature',
            TYPENAMES: layer, COUNT: String(count), STARTINDEX: String(startIndex),
            SORTBY: 'id',
            OUTPUTFORMAT: 'application/json', SRSNAME: 'EPSG:4326',
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
        if (geojson.exceptions || geojson.type === 'ExceptionReport') {
            throw new Error(`WFS exception: ${JSON.stringify(geojson)}`);
        }
        const features = geojson.features ?? [];
        const trees = features.map(toTree).filter(Boolean);
        return { trees, rawCount: features.length };
    },

    parseCount(raw) {
        const m = raw.match(/numberMatched="(\d+)"/);
        return m ? parseInt(m[1], 10) : 0;
    },
};
