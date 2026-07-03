#!/usr/bin/env node
/**
 * Fetches the Pinetum Ter Borgh (Anloo) collection from the shared Von
 * Gimborn Arboretum collection database. See lib/collectie-gimborn.js for
 * the protocol details (no public API — this replays an ASP.NET WebForms
 * postback flow) and the reverse-engineering trail, first done against
 * cities/trompenburg.js.
 *
 * growthFormIndex: null is an ASSUMPTION carried over from Gimborn, not
 * independently confirmed for this institution — Ter Borgh is a "pinetum"
 * (a conifer-specific collection), so its own manual search flow seems
 * unlikely to need a WOODY/PERENNIAL/SUCCULENT distinction the way a mixed
 * botanical garden like Trompenburg does. Revisit if this turns out wrong.
 *
 * Trees with no recorded GPS coordinate are dropped by default; pass
 * --include-unmapped to keep them (lat/lon null). species_binomial/
 * species_cultivar run through the standard processSpecies() pipeline;
 * name_vernacular keeps the source's own name where present, falling back
 * to registry.json only where missing. See cities/trompenburg.js for more
 * on all of the above — identical behaviour, shared implementation.
 *
 * Usage:
 *   node cities/pinetum-ter-borgh.js                    # full fetch → data/pinetum-ter-borgh.db
 *   node cities/pinetum-ter-borgh.js --format json
 *   node cities/pinetum-ter-borgh.js --include-unmapped
 *   node cities/pinetum-ter-borgh.js --letters ab        # debug: only these starting letters
 *   node cities/pinetum-ter-borgh.js --term "Pinus"      # debug: one exact search term
 *   node cities/pinetum-ter-borgh.js -d                  # dry run, print JSON, no file written
 */

import { runCli } from '../lib/collectie-gimborn.js';

// The shared database's four institutions form four distinct, well-separated
// geographic clusters — a margin around Ter Borgh's observed specimen cluster
// (lat 53.0275–53.0290, lon 6.7038–6.7063 from a sample fetch; the whole site
// is tiny, ~170m across), same approach as cities/trompenburg.js.
const TERBORGH_BBOX = { latMin: 53.02, latMax: 53.035, lonMin: 6.695, lonMax: 6.71 };

runCli({
    cityId: 'pinetum-ter-borgh',
    arboretumIndex: 3,      // "Pinetum Ter Borgh" within cbArboreta
    growthFormIndex: null,  // assumed no growth-form step — see header comment
    bbox: TERBORGH_BBOX,
}).catch(err => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
});
