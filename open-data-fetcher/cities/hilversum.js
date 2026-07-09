import { processSpeciesTagged } from '../lib/species.js';

const WFS_URL = 'https://geo.hilversum.nl/geoserver/ows';
const LAYER   = 'hilversum:GV_BOMEN';

// "0,2 tot 0,3 m." → 0.25, "tot 0,2 m." → 0.10 (Dutch comma decimal, result in metres)
function parseDiameterClass(s) {
    if (!s) return null;
    const norm = s.replace(/,/g, '.');
    const range = norm.match(/([\d.]+)\s+tot\s+([\d.]+)/);
    if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
    const lt = norm.match(/tot\s+([\d.]+)/);
    if (lt) return parseFloat(lt[1]) / 2;
    return null;
}

function toTree(feature) {
    if (!feature?.properties) return { dropped: 'invalid_record' };
    if (!feature.geometry?.coordinates) return { dropped: 'no_geometry' };
    const p = feature.properties;
    const [lon, lat] = feature.geometry.coordinates;

    const rawSpecies = (p.SOORTNAAM ?? '').trim();
    const speciesResult = processSpeciesTagged(rawSpecies);
    if (speciesResult.dropped) return speciesResult;

    // JAARVANAANLEG can be null, "N.v.t.", or a year string/number
    const rawYear = p.JAARVANAANLEG;
    const yearNum = rawYear ? parseInt(rawYear, 10) : NaN;
    const year = yearNum > 1800 ? String(yearNum) : null;

    return {
        id:             String(p.OBJECTNUMMER),
        lat:            +parseFloat(lat).toFixed(7),
        lon:            +parseFloat(lon).toFixed(7),
        species:        rawSpecies,
        ...speciesResult,
        name_vernacular: p.SOORTNAAM_NED || null,
        year_planted:   year,
        neighbourhood:  p.BUURT || p.WIJK || null,
        street:         p.OPENBARERUIMTE || null,
        trunk_diameter: parseDiameterClass(p.STAMDIAMETERKLASSE),
        crown_spread:   null,
    };
}

export default {
    name: 'hilversum',
    wfsUrl: WFS_URL,
    layer: LAYER,
    outputFile: { json: 'hilversum.json', sqlite: 'hilversum.db' },
    fetchOptions: { rejectUnauthorized: false },

    keysetPaging: true,

    pageParams(layer, count, lastId) {
        return new URLSearchParams({
            SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature',
            TYPENAMES: layer, COUNT: String(count),
            SORTBY: 'OBJECTNUMMER',
            CQL_FILTER: lastId != null
                ? `SOORTNAAM IS NOT NULL AND OBJECTNUMMER>${lastId}`
                : 'SOORTNAAM IS NOT NULL',
            OUTPUTFORMAT: 'application/json', SRSNAME: 'EPSG:4326',
        });
    },

    countParams(layer) {
        return new URLSearchParams({
            SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature',
            TYPENAMES: layer, resultType: 'hits',
            CQL_FILTER: 'SOORTNAAM IS NOT NULL',
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
