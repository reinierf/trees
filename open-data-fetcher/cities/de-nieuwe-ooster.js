/**
 * Fetches the tree collection of De Nieuwe Ooster (Amsterdam), a cemetery
 * park with an arboretum collection, from the "GRIB" viewer platform behind
 * viewer.bomenwacht.nl (https://viewer.bomenwacht.nl/?code=DNO1oqxV6qBv).
 *
 * No public API — this replays the Angular viewer's own client calls. The
 * platform (grib.app) is a generic tree/asset-inventory product used by
 * multiple organisations; every viewer build embeds the same function key in
 * its JS bundle (found in main-*.js as `environment.appFunctionKey`), so this
 * isn't specific to De Nieuwe Ooster's own credentials.
 *
 * Protocol (two Azure Functions calls, chained only once — the second value
 * is stable and hardcoded below rather than re-resolved on every run):
 *   1. GET start/{shareCode}?code={functionKey} → resolves the public share
 *      code from the viewer URL to a `keten_id` (2818 for this site) plus
 *      the org's field-label config. Not called by this fetcher — recorded
 *      here for provenance; re-derive by GETing
 *      https://start-func.grib.app/api/start/DNO1oqxV6qBv?code={functionKey}
 *      if this ever needs re-verifying.
 *   2. GET start/keten/{keten_id}?code={functionKey} → the full tree array,
 *      uncapped, no pagination (2,989 trees / ~4MB for this site).
 *
 * This URL already carries its own `?code=...` — lib/http.js's fetchRaw()
 * joins it with '&' rather than a second '?' (fixed for exactly this case;
 * a bare `?` landing inside the key's value 401s the request, confirmed
 * live), so this can run through index.js's normal singleFetch path same as
 * any WFS city.
 *
 * Coordinates are EPSG:3857 (Web Mercator) — a plain spherical inverse
 * projection suffices (no proj4/datum grid needed, unlike RD New).
 *
 * Field mapping (most of the platform's generic schema is unused/null here;
 * this org only populates its `custom_*` slots):
 *   custom_one   → species (Latin binomial + cultivar)
 *   custom_two   → source's own Dutch vernacular name
 *   custom_four  → "Grafvak" (grave-plot section number) → street
 *   plantjaar    → year_planted
 * `custom_five` ("Herkomst" / origin) has no equivalent column in this
 * project's tree schema and is dropped.
 */

import { processSpecies, getVernacularNl } from '../lib/species.js';

const FUNCTION_KEY = 'bEiYsP92NEgBpsd5oE2i3DLkgJlV1thl5696wYWJ/Wg/u9A3SkL7RA==';
const DATA_URL = `https://start-func.grib.app/api/start/keten/2818?code=${encodeURIComponent(FUNCTION_KEY)}`;

// Spherical Web Mercator inverse (matches EPSG:3857's spherical, not ellipsoidal, definition).
const EARTH_RADIUS = 6378137;
function webMercatorToWgs84(x, y) {
    const lon = (x / EARTH_RADIUS) * (180 / Math.PI);
    const lat = (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * (180 / Math.PI);
    return [lon, lat];
}

function recordToTree(rec) {
    if (rec.location?.type !== 'Point') return null;
    const speciesResult = processSpecies(rec.custom_one);
    if (!speciesResult) return null;

    const [lon, lat] = webMercatorToWgs84(...rec.location.coordinates);
    const sourceVernacular = rec.custom_two?.trim() || null;

    return {
        lat: +lat.toFixed(7),
        lon: +lon.toFixed(7),
        id: String(rec.id),
        year_planted: rec.plantjaar ? String(rec.plantjaar) : null,
        name_vernacular: sourceVernacular ?? getVernacularNl(speciesResult.species_binomial),
        species: rec.custom_one,
        species_binomial: speciesResult.species_binomial,
        species_cultivar: speciesResult.species_cultivar,
        neighbourhood: null,
        street: rec.custom_four?.trim() || null,
        trunk_diameter: null,
        crown_spread: null,
    };
}

export default {
    name: 'de-nieuwe-ooster',
    wfsUrl: DATA_URL,
    layer: null,
    singleFetch: true,
    outputFile: { json: 'de-nieuwe-ooster.json', sqlite: 'de-nieuwe-ooster.db' },

    async parse(raw) {
        const records = JSON.parse(raw);
        const trees = records.map(recordToTree).filter(Boolean);
        return { trees };
    },
};
