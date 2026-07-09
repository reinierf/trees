import { processSpeciesTagged } from '../lib/species.js';

// GeoServer WFS 2.0.0 — 24,736 municipal trees
// Full dataset at V_BOMEN_GRIB_GEM (not just the 430 monumental trees in V_BOMEN_GRIB_MON)
const WFS_URL = 'https://gis.gouda.nl/geoserver/Open/wfs';
const LAYER   = 'Open:V_BOMEN_GRIB_GEM';

function parseDiameter(kl) {
    if (!kl) return null;
    const s = kl.trim();
    const lt = s.match(/^<\s*(\d+)\s*cm$/i);
    if (lt) return parseFloat(lt[1]) / 2 / 100;
    const gt = s.match(/^>\s*(\d+)\s*cm$/i);
    if (gt) return parseFloat(gt[1]) * 1.25 / 100;
    const range = s.match(/^(\d+)\s*tot\s*(\d+)\s*cm$/i);
    if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2 / 100;
    return null;
}

function toTree(feature) {
    if (!feature?.properties) return { dropped: 'invalid_record' };
    const p      = feature.properties;
    const coords = feature.geometry?.coordinates; // GeoJSON [lon, lat]
    if (!Array.isArray(coords) || coords.length < 2) return { dropped: 'no_geometry' };

    const rawSpecies = (p.SOORT ?? '').trim();
    const speciesResult = processSpeciesTagged(rawSpecies);
    if (speciesResult.dropped) return speciesResult;

    return {
        id:             String(p.GRIB_ID ?? ''),
        lat:            +parseFloat(coords[1]).toFixed(7),
        lon:            +parseFloat(coords[0]).toFixed(7),
        species:        rawSpecies,
        ...speciesResult,
        name_vernacular: p.SOORT_NL || null,
        year_planted:   null,
        neighbourhood:  p.BUURT || p.WIJK || null,
        street:         p.STRAAT || null,
        trunk_diameter: parseDiameter(p.DIAMETERKL),
        crown_spread:   null,
    };
}

export default {
    name: 'gouda',
    wfsUrl: WFS_URL,
    layer: LAYER,
    outputFile: { json: 'gouda.json', sqlite: 'gouda.db' },

    keysetPaging: true,

    pageParams(layer, count, lastId) {
        const p = {
            service:      'WFS',
            version:      '2.0.0',
            request:      'GetFeature',
            TYPENAMES:    layer,
            COUNT:        String(count),
            sortBy:       'GRIB_ID',
            outputFormat: 'application/json',
            SRSNAME:      'EPSG:4326',
        };
        if (lastId != null) p.CQL_FILTER = `GRIB_ID>${lastId}`;
        return new URLSearchParams(p);
    },

    countParams(layer) {
        return new URLSearchParams({
            service:      'WFS',
            version:      '2.0.0',
            request:      'GetFeature',
            TYPENAMES:    layer,
            COUNT:        '1',
            outputFormat: 'application/json',
            SRSNAME:      'EPSG:4326',
        });
    },

    async parse(raw, _layer) {
        const geojson = JSON.parse(raw);
        if (geojson.type === 'ExceptionReport' || geojson.exceptions) {
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
        const json = JSON.parse(raw);
        return json.totalFeatures ?? json.numberMatched ?? 0;
    },
};
