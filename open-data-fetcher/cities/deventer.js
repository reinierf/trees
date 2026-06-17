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

// Latin binomials have a lowercase species epithet ("Betula pendula").
// Dutch cultivar names are title-cased throughout ("Zoete Campagner").
function looksLikeLatin(s) {
    const words = s.trim().split(/\s+/);
    const second = (words[1] === '×' || words[1]?.toLowerCase() === 'x') ? words[2] : words[1];
    return second != null && /^[a-z]/.test(second);
}

function resolveSpecies(raw, dutch) {
    if (!raw) return null;
    const rawUpper = raw.trim().toUpperCase().replace(/\s+/g, ' ');
    if (INVALID_SPECIES.has(rawUpper)) return null;

    // Check Dutch type field first — doing this before processSpecies avoids treating
    // cultivar names like "Schone van Boskoop" as fake Latin binomials.
    const dutchUpper = (dutch ?? '').trim().toUpperCase();
    const fruitBinomial = FRUIT_TYPE_BINOMIAL[dutchUpper];
    if (fruitBinomial) {
        // species=null so validate-species skips it (cultivar name is not a Latin species).
        return { rawSpecies: null, species_binomial: fruitBinomial, species_cultivar: raw.trim() };
    }

    // "TYPE: CULTIVAR" format (e.g. "Kweepeer: Champion", "Mispel: Westerveld").
    const colon = dutchUpper.indexOf(':');
    if (colon > 0) {
        const prefixBinomial = FRUIT_TYPE_BINOMIAL[dutchUpper.slice(0, colon).trim()];
        if (prefixBinomial) {
            const cultivar = raw.trim().slice(raw.indexOf(':') + 1).trim() || raw.trim();
            return { rawSpecies: null, species_binomial: prefixBinomial, species_cultivar: cultivar };
        }
    }

    // Both fields identical → cultivar name with no type info (e.g. "Benderzoet" | "Benderzoet").
    // Use a generic fallback so the tree is still shown on the map.
    if (raw.trim() === dutch?.trim()) {
        return { rawSpecies: null, species_binomial: 'FRUITBOOM', species_cultivar: raw.trim() };
    }

    // Normal Latin species path — but verify the raw string actually looks Latin first.
    // Catches Dutch cultivar names like "Zoete Campagner" (dutch="-") that processSpecies
    // would otherwise echo back as a fake binomial "ZOETE CAMPAGNER".
    const result = processSpecies(raw);
    if (result && looksLikeLatin(raw)) return { rawSpecies: raw.trim(), ...result };

    // processSpecies failed on a non-empty, non-filtered value — keep the tree with a generic.
    return { rawSpecies: null, species_binomial: 'FRUITBOOM', species_cultivar: raw.trim() };
}

function toTree(feature) {
    const a = feature.attributes;
    const g = feature.geometry;
    if (!g?.x || !g?.y) return null;

    const resolution = resolveSpecies(a.i_boomsoort_latijn ?? '', a.i_boomsoort_nederlands);
    if (!resolution) return null;
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
            where: '1=1',
            outFields: OUT_FIELDS,
            returnGeometry: 'true',
            outSR: '4326',
            f: 'json',
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
