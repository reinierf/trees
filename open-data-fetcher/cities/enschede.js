import { processSpecies } from '../lib/species.js';

// ArcGIS MapServer — Enschede public tree management system, ~83k trees
// Coordinates in RD New (EPSG:28992); outSR=4326 reprojects server-side.
const BASE_URL = 'https://geoportaal.enschede.nl/arcgis/rest/services/OpenbareRuimte_Bomen/MapServer/0/query';

const OUT_FIELDS = 'OBJECTID,LATBOOMSOORT,NEDERLANDS';

// Enschede source data uses abbreviated genera (e.g. "LIQ.", "GLEDIT.", "SOR").
// Expand these to the full genus before passing to processSpecies so that the
// global binomial corrections and species extraction work correctly.
const GENUS_EXPAND = {
    'AESCUL':     'AESCULUS',
    'AMELAN':     'AMELANCHIER',
    'AMEL':       'AMELANCHIER',
    'BET':        'BETULA',
    'CHM':        'CHAMAECYPARIS',
    'FRAX':       'FRAXINUS',
    'FRAXIN':     'FRAXINUS',
    'GLEDIT':     'GLEDITSIA',
    'LIQ':        'LIQUIDAMBAR',
    'LIQUID':     'LIQUIDAMBAR',
    'MAGN':       'MAGNOLIA',
    'PHELL':      'PHELLODENDRON',
    'ROB':        'ROBINIA',
    'SEQUOIADEN': 'SEQUOIADENDRON',
    'SOR':        'SORBUS',
};

function normalizeEnschedeSpecies(raw) {
    if (!raw) return raw;
    // Match the first word (abbreviated genus, optional trailing dot) + the rest.
    // Works both with a space separator ("GLEDIT. TR") and without ("BET.MAXIMOWICZIANA").
    const m = raw.trim().toUpperCase().match(/^([A-Z]+)\.?\s*(.*)/);
    if (!m) return raw;
    const expanded = GENUS_EXPAND[m[1]];
    if (!expanded) return raw;
    const rest = m[2].trim();
    return rest ? `${expanded} ${rest}` : expanded;
}

function toTree(feature) {
    const a = feature.attributes;
    const g = feature.geometry;
    if (!g?.x || !g?.y) return null;

    const rawSpecies = (a.LATBOOMSOORT ?? '').trim();
    const speciesResult = processSpecies(normalizeEnschedeSpecies(rawSpecies));
    if (!speciesResult) return null;

    return {
        id:              String(a.OBJECTID),
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: a.NEDERLANDS || null,
        year_planted:    null,
        neighbourhood:   null,
        street:          null,
        trunk_diameter:  null,
        crown_spread:    null,
    };
}

export default {
    name: 'enschede',
    wfsUrl: BASE_URL,
    layer: null,
    outputFile: { json: 'enschede.json', sqlite: 'enschede.db' },
    fetchOptions: { rejectUnauthorized: false },

    pageParams(_layer, count, startIndex) {
        return new URLSearchParams({
            where:             '1=1',
            outFields:         OUT_FIELDS,
            returnGeometry:    'true',
            outSR:             '4326',
            f:                 'json',
            resultOffset:      String(startIndex),
            resultRecordCount: String(count),
        });
    },

    countParams(_layer) {
        return new URLSearchParams({ where: '1=1', returnCountOnly: 'true', f: 'json' });
    },

    async parse(raw, _layer) {
        const json = JSON.parse(raw);
        if (json.error) throw new Error(`ArcGIS error ${json.error.code}: ${json.error.message}`);
        const features = json.features ?? [];
        const trees = features.map(f => toTree(f)).filter(Boolean);
        return { trees, rawCount: features.length };
    },

    async parseCount(raw) {
        const json = JSON.parse(raw);
        if (json.error) throw new Error(`ArcGIS error ${json.error.code}: ${json.error.message}`);
        return json.count ?? 0;
    },
};
