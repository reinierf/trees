import { processSpecies } from '../lib/species.js';

// ArcGIS FeatureServer — Deventer public trees, ~72k trees
const BASE_URL = 'https://services3.arcgis.com/vIFGkPPowfxZWvaV/arcgis/rest/services'
    + '/Bomen_bestand_Deventer_openbaar/FeatureServer/0/query';

const OUT_FIELDS = 'OBJECTID,adm_boomnummer_klant,i_boomsoort_latijn,i_boomsoort_nederlands,'
    + 'i_stamdiameterklasse,adm_straatnaam,adm_plantjaar';

// "50-100cm" → 0.75, "<20cm" → 0.1 (result in metres)
function parseDiameterClass(s) {
    if (!s) return null;
    const range = s.match(/(\d+)\s*-\s*(\d+)/);
    if (range) return (parseInt(range[1], 10) + parseInt(range[2], 10)) / 2 / 100;
    const lt = s.match(/<\s*(\d+)/);
    if (lt) return parseInt(lt[1], 10) / 2 / 100;
    return null;
}

// Deventer sometimes stores cultivar names in i_boomsoort_latijn instead of a Latin species.
// i_boomsoort_nederlands then tells us the fruit type ("Appel", "Peer", "Pruim", etc.).
const FRUIT_TYPE_BINOMIAL = {
    'APPEL':    'MALUS DOMESTICA',
    'PEER':     'PYRUS COMMUNIS',
    'PRUIM':    'PRUNUS DOMESTICA',
    'KERS':     'PRUNUS AVIUM',
    'KWEEPEER': 'CYDONIA OBLONGA',
    'MISPEL':   'MESPILUS GERMANICA',
};

// Entries that indicate the record is not an actual tree.
const INVALID_SPECIES = new Set([
    'NVT', 'N.V.T.', 'NIET BEPAALD', 'NIET TE BEOORDELEN',
    'N.V.T. (BOOM NIET AANWEZIG)',
]);

// Pre-scan all features in a page to build a lookup of raw species values that are
// definitively resolved as cultivars (known fruit type, colon format, or identical fields).
// This allows a second pass to resolve ambiguous entries like "Zoete Campagner" | "-"
// by matching them against the twin "Zoete Campagner" | "Zoete Campagner" seen elsewhere
// in the same page — without relying on string capitalisation heuristics.
function buildCultivarMap(features) {
    const map = new Map();
    for (const f of features) {
        const a = f.attributes;
        const raw = (a.i_boomsoort_latijn ?? '').trim();
        if (!raw) continue;
        const dutch = a.i_boomsoort_nederlands;
        const rawUpper = raw.toUpperCase().replace(/\s+/g, ' ');
        if (INVALID_SPECIES.has(rawUpper)) continue;
        const dutchUpper = (dutch ?? '').trim().toUpperCase();

        const fruitBinomial = FRUIT_TYPE_BINOMIAL[dutchUpper];
        if (fruitBinomial) {
            map.set(raw, { species_binomial: fruitBinomial, species_cultivar: raw });
            continue;
        }

        const colon = dutchUpper.indexOf(':');
        if (colon > 0) {
            const prefixBinomial = FRUIT_TYPE_BINOMIAL[dutchUpper.slice(0, colon).trim()];
            if (prefixBinomial) {
                const cultivar = raw.slice(raw.indexOf(':') + 1).trim() || raw;
                map.set(raw, { species_binomial: prefixBinomial, species_cultivar: cultivar });
                continue;
            }
        }

        if (raw === dutch?.trim()) {
            map.set(raw, { species_binomial: 'FRUITBOOM', species_cultivar: raw });
        }
    }
    return map;
}

function resolveSpecies(raw, cultivarMap) {
    if (!raw) return null;
    const rawUpper = raw.trim().toUpperCase().replace(/\s+/g, ' ');
    if (INVALID_SPECIES.has(rawUpper)) return null;

    // Second pass: raw value recognised as a cultivar elsewhere in this page.
    // species=null so validate-species skips it (cultivar name is not a Latin species).
    const cultivar = cultivarMap.get(raw.trim());
    if (cultivar) return { rawSpecies: null, ...cultivar };

    // Normal Latin species path.
    const result = processSpecies(raw);
    if (result) return { rawSpecies: raw.trim(), ...result };

    // processSpecies failed — keep the tree with a generic binomial.
    return { rawSpecies: null, species_binomial: 'FRUITBOOM', species_cultivar: raw.trim() };
}

function toTree(feature, cultivarMap) {
    const a = feature.attributes;
    const g = feature.geometry;
    if (!g?.x || !g?.y) return { dropped: 'no_geometry' };

    const resolution = resolveSpecies(a.i_boomsoort_latijn ?? '', cultivarMap);
    if (!resolution) {
        return { dropped: (a.i_boomsoort_latijn ?? '').trim() ? 'excluded' : 'empty_species' };
    }
    const { rawSpecies, species_binomial, species_cultivar } = resolution;

    return {
        id:              String(a.adm_boomnummer_klant ?? a.OBJECTID),
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         rawSpecies,
        species_binomial,
        species_cultivar,
        name_vernacular: a.i_boomsoort_nederlands || null,
        year_planted:    a.adm_plantjaar ? String(a.adm_plantjaar) : null,
        neighbourhood:   null,
        street:          a.adm_straatnaam || null,
        trunk_diameter:  parseDiameterClass(a.i_stamdiameterklasse),
        crown_spread:    null,
    };
}

export default {
    name: 'deventer',
    wfsUrl: BASE_URL,
    layer: null,
    outputFile: { json: 'deventer.json', sqlite: 'deventer.db' },

    pageParams(_layer, count, startIndex) {
        return new URLSearchParams({
            where:             '1=1',
            outFields:         OUT_FIELDS,
            returnGeometry:    'true',
            outSR:             '4326',
            f:                 'json',
            orderByFields:     'OBJECTID ASC',
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
        const cultivarMap = buildCultivarMap(features);
        const trees = [];
        const dropped = {};
        for (const r of features.map(f => toTree(f, cultivarMap))) {
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

    // Cross-page second pass: fix trees that fell through to processSpecies on one page
    // but whose raw species value is recognised as a cultivar from another page.
    // (The per-page buildCultivarMap already handles within-page twins; this catches the rest.)
    postProcess(trees) {
        const cultivarMap = new Map();
        for (const t of trees) {
            if (t.species === null && t.species_cultivar)
                cultivarMap.set(t.species_cultivar, {
                    species_binomial: t.species_binomial,
                    species_cultivar: t.species_cultivar,
                });
        }
        if (cultivarMap.size === 0) return trees;
        return trees.map(t => {
            if (t.species === null) return t;
            const cultivar = cultivarMap.get(t.species);
            return cultivar ? { ...t, species: null, ...cultivar } : t;
        });
    },
};
