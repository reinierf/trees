#!/usr/bin/env node
/**
 * Fetches the Pinetum de Dennenhorst (Lunteren) collection from the shared
 * Von Gimborn Arboretum collection database. See lib/collectie-gimborn.js
 * for the protocol details (no public API — this replays an ASP.NET
 * WebForms postback flow) and the reverse-engineering trail, first done
 * against cities/trompenburg.js.
 *
 * growthFormIndex: null is an ASSUMPTION carried over from Gimborn/Ter Borgh,
 * not independently confirmed for this institution — Dennenhorst is also a
 * "pinetum" (a conifer-specific collection), so its own manual search flow
 * seems unlikely to need a WOODY/PERENNIAL/SUCCULENT distinction the way a
 * mixed botanical garden like Trompenburg does. Revisit if this turns out
 * wrong.
 *
 * Trees with no recorded GPS coordinate are dropped by default; pass
 * --include-unmapped to keep them (lat/lon null). species_binomial/
 * species_cultivar run through the standard processSpecies() pipeline;
 * name_vernacular keeps the source's own name where present, falling back
 * to registry.json only where missing. See cities/trompenburg.js for more
 * on all of the above — identical behaviour, shared implementation.
 *
 * Usage:
 *   node cities/pinetum-dennenhorst.js                    # full fetch → data/pinetum-dennenhorst.db
 *   node cities/pinetum-dennenhorst.js --format json
 *   node cities/pinetum-dennenhorst.js --include-unmapped
 *   node cities/pinetum-dennenhorst.js --letters ab        # debug: only these starting letters
 *   node cities/pinetum-dennenhorst.js --term "Pinus"      # debug: one exact search term
 *   node cities/pinetum-dennenhorst.js -d                  # dry run, print JSON, no file written
 */

import { runCli } from '../lib/collectie-gimborn.js';

// The shared database's four institutions form four distinct, well-separated
// geographic clusters — a margin around Dennenhorst's observed specimen
// cluster (lat 52.0883–52.0909, lon 5.6437–5.6479 from a sample fetch), same
// approach as cities/trompenburg.js.
const DENNENHORST_BBOX = { latMin: 52.085, latMax: 52.095, lonMin: 5.64, lonMax: 5.652 };

runCli({
    cityId: 'pinetum-dennenhorst',
    arboretumIndex: 1,      // "Pinetum de Dennenhorst" within cbArboreta
    growthFormIndex: null,  // assumed no growth-form step — see header comment
    bbox: DENNENHORST_BBOX,
}).catch(err => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
});
