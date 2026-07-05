/**
 * Fetches the municipality of Bergen (NH)'s inventory of "bijzondere" (special)
 * and "monumentale" (monumental) trees from the "GRIB" viewer platform behind
 * viewer.bomenwacht.nl (https://viewer.bomenwacht.nl/?code=QWyMq83Ab2Yvuvyr).
 *
 * Same platform/protocol as De Nieuwe Ooster (see that file's header for the
 * full reverse-engineering notes) — this is a curated subset of Bergen's
 * trees (those registered on the municipal tree list as special, monumental,
 * or nationally monumental), not the full municipal tree stock, so it's
 * registered under a distinct id rather than plain "bergen".
 *
 *   1. GET start/{shareCode}?code={functionKey} → resolves the share code to
 *      `keten_id: 100` for this site, plus its field-label config. Not
 *      called by this fetcher — recorded here for provenance; re-derive by
 *      GETing https://start-func.grib.app/api/start/QWyMq83Ab2Yvuvyr?code={functionKey}
 *      if this ever needs re-verifying.
 *   2. GET start/keten/{keten_id}?code={functionKey} → the full tree array,
 *      uncapped, no pagination (4,114 trees / ~5.8MB for this site).
 *
 * Unlike De Nieuwe Ooster (which only populates its generic `custom_*`
 * slots), this org's data uses the platform's named fields directly: `soort`
 * (Latin species), `soort_nl` (Dutch name), `straat`/`buurt` (street/
 * neighbourhood), `diameterklasse` (trunk diameter *class*, not a precise
 * measurement — parsed the same way as Deventer's `i_stamdiameterklasse`).
 * `custom_one` holds the special/monumental status ("Bijzonder" /
 * "Monumentaal" / "Monumentaal (landelijk)") — not mapped to any column in
 * this project's tree schema and dropped, same treatment as fields with no
 * equivalent elsewhere (e.g. De Nieuwe Ooster's "Herkomst").
 */

import { processSpecies, getVernacularNl } from '../lib/species.js';

const FUNCTION_KEY = 'bEiYsP92NEgBpsd5oE2i3DLkgJlV1thl5696wYWJ/Wg/u9A3SkL7RA==';
const DATA_URL = `https://start-func.grib.app/api/start/keten/100?code=${encodeURIComponent(FUNCTION_KEY)}`;

// Spherical Web Mercator inverse (matches EPSG:3857's spherical, not ellipsoidal, definition).
const EARTH_RADIUS = 6378137;
function webMercatorToWgs84(x, y) {
    const lon = (x / EARTH_RADIUS) * (180 / Math.PI);
    const lat = (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * (180 / Math.PI);
    return [lon, lat];
}

// "50 - 100" → 0.75, "< 20" → 0.1 (result in metres). Same convention as deventer.js.
function parseDiameterClass(s) {
    if (!s) return null;
    const range = s.match(/(\d+)\s*-\s*(\d+)/);
    if (range) return (parseInt(range[1], 10) + parseInt(range[2], 10)) / 2 / 100;
    const lt = s.match(/<\s*(\d+)/);
    if (lt) return parseInt(lt[1], 10) / 2 / 100;
    return null;
}

function recordToTree(rec) {
    if (rec.location?.type !== 'Point') return null;
    const speciesResult = processSpecies(rec.soort);
    if (!speciesResult) return null;

    const [lon, lat] = webMercatorToWgs84(...rec.location.coordinates);
    const sourceVernacular = rec.soort_nl?.trim() || null;

    return {
        lat: +lat.toFixed(7),
        lon: +lon.toFixed(7),
        id: String(rec.id),
        year_planted: rec.plantjaar ? String(rec.plantjaar) : null,
        name_vernacular: sourceVernacular ?? getVernacularNl(speciesResult.species_binomial),
        species: rec.soort,
        species_binomial: speciesResult.species_binomial,
        species_cultivar: speciesResult.species_cultivar,
        neighbourhood: rec.buurt?.trim() || null,
        street: rec.straat?.trim() || null,
        trunk_diameter: parseDiameterClass(rec.diameterklasse),
        crown_spread: null,
    };
}

export default {
    name: 'bergen-monumentale-bomen',
    wfsUrl: DATA_URL,
    layer: null,
    singleFetch: true,
    fetchOptions: { rejectUnauthorized: false },
    outputFile: { json: 'bergen-monumentale-bomen.json', sqlite: 'bergen-monumentale-bomen.db' },

    async parse(raw) {
        const records = JSON.parse(raw);
        const trees = records.map(recordToTree).filter(Boolean);
        return { trees };
    },
};
