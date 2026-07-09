import { processSpeciesTagged } from '../lib/species.js';

const LAYER_URLS = {
    'bomen':    'https://geoportaal.wageningen.nl/arcgis/rest/services/Thema/Bomen/FeatureServer/0/query',
    'mon-part': 'https://geoportaal.wageningen.nl/arcgis/rest/services/Thema/MonumentaleBomen/MapServer/0/query',
    'mon-gem':  'https://geoportaal.wageningen.nl/arcgis/rest/services/Thema/MonumentaleBomen/MapServer/1/query',
};

// "Quercus onbekend" → "Quercus" (genus only); bare "onbekend" → null (drop)
function normalizeSpecies(raw) {
    if (!raw) return null;
    const cleaned = raw.trim().replace(/\s+onbekend\s*$/i, '').trim();
    if (!cleaned || /^onbekend$/i.test(cleaned)) return null;
    return cleaned;
}

// "100 tot 150 cm" → 1.25 m, "75-100" → 0.875 m, "< 20 cm" → 0.1 m
function parseDiameter(s) {
    if (!s) return null;
    const dutch = s.match(/(\d+)\s+tot\s+(\d+)/);
    if (dutch) return (parseInt(dutch[1]) + parseInt(dutch[2])) / 2 / 100;
    const dash = s.match(/^(\d+)-(\d+)$/);
    if (dash) return (parseInt(dash[1]) + parseInt(dash[2])) / 2 / 100;
    const lt = s.match(/<\s*(\d+)/);
    if (lt) return parseInt(lt[1]) / 2 / 100;
    return null;
}

function toBomenTree(f) {
    const a = f.attributes;
    const g = f.geometry;
    if (!g?.x || !g?.y) return { dropped: 'no_geometry' };
    const raw = normalizeSpecies(a.SOORT_WET ?? '');
    if (!raw) return { dropped: 'empty_species' };
    const speciesResult = processSpeciesTagged(raw);
    if (speciesResult.dropped) return speciesResult;
    return {
        id:              'b-' + String(a.OBJECTID),
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         raw,
        ...speciesResult,
        name_vernacular: a.SOORT_NED || null,
        year_planted:    a.Jaar ? String(a.Jaar) : null,
        neighbourhood:   a.RAYON || null,
        street:          null,
        trunk_diameter:  parseDiameter(a.Stamdiameter),
        crown_spread:    null,
    };
}

function toMonPartTree(f) {
    const a = f.attributes;
    const g = f.geometry;
    if (!g?.x || !g?.y) return { dropped: 'no_geometry' };
    const raw = (a.Boomsoort ?? '').trim();
    const speciesResult = processSpeciesTagged(raw);
    if (speciesResult.dropped) return speciesResult;
    return {
        id:              'mp-' + String(a.OBJECTID),
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         raw,
        ...speciesResult,
        name_vernacular: null,
        year_planted:    null,
        neighbourhood:   null,
        street:          a.Straatnaam || null,
        trunk_diameter:  parseDiameter(a.Stamdiamet),
        crown_spread:    null,
    };
}

function toMonGemTree(f) {
    const a = f.attributes;
    const g = f.geometry;
    if (!g?.x || !g?.y) return { dropped: 'no_geometry' };
    const raw = (a.ALGEMEEN03 ?? '').trim();
    const speciesResult = processSpeciesTagged(raw);
    if (speciesResult.dropped) return speciesResult;
    return {
        id:              'mg-' + String(a.OBJECTID),
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         raw,
        ...speciesResult,
        name_vernacular: null,
        year_planted:    null,
        neighbourhood:   null,
        street:          null,
        trunk_diameter:  null,
        crown_spread:    null,
    };
}

export default {
    name: 'wageningen',
    wfsUrl: (layer) => LAYER_URLS[layer],
    layer: null,
    layers: ['bomen', 'mon-part', 'mon-gem'],
    outputFile: { json: 'wageningen.json', sqlite: 'wageningen.db' },
    fetchOptions: { rejectUnauthorized: false },

    pageParams(layer, count, startIndex) {
        const base = {
            where:             '1=1',
            f:                 'json',
            outSR:             '4326',
            resultOffset:      String(startIndex),
            resultRecordCount: String(count),
            orderByFields:     'OBJECTID ASC',
        };
        if (layer === 'bomen') {
            return new URLSearchParams({
                ...base,
                outFields: 'OBJECTID,SOORT_WET,SOORT_NED,Stamdiameter,Jaar,RAYON',
            });
        }
        if (layer === 'mon-part') {
            return new URLSearchParams({
                ...base,
                outFields: 'OBJECTID,Boomsoort,Stamdiamet,Straatnaam',
            });
        }
        return new URLSearchParams({
            ...base,
            outFields: 'OBJECTID,ALGEMEEN03',
        });
    },

    countParams(_layer) {
        return new URLSearchParams({ where: '1=1', returnCountOnly: 'true', f: 'json' });
    },

    async parse(raw, layer) {
        const json = JSON.parse(raw);
        if (json.error) throw new Error(`ArcGIS error ${json.error.code}: ${json.error.message}`);
        const features = json.features ?? [];
        const toFn = layer === 'bomen' ? toBomenTree : layer === 'mon-part' ? toMonPartTree : toMonGemTree;
        const trees = [];
        const dropped = {};
        for (const r of features.map(toFn)) {
            if (r?.dropped) { dropped[r.dropped] = (dropped[r.dropped] ?? 0) + 1; }
            else if (r) trees.push(r);
        }
        return { trees, rawCount: features.length, dropped };
    },

    async parseCount(raw) {
        const json = JSON.parse(raw);
        if (json.error) throw new Error(`ArcGIS error ${json.error.code}: ${json.error.message}`);
        return json.count ?? 0;
    },
};
