#!/usr/bin/env node
/**
 * Fetches the Nationaal Bomenmuseum Gimborn (Doorn) collection from the
 * shared Von Gimborn Arboretum collection database. See
 * lib/collectie-gimborn.js for the protocol details (no public API — this
 * replays an ASP.NET WebForms postback flow) and the reverse-engineering
 * trail, first done against cities/trompenburg.js.
 *
 * Unlike Trompenburg, this institution's own manual search flow has no
 * growth-form ("WOODY" etc.) selection step — growthFormIndex is null, so
 * that postback is skipped entirely and results aren't filtered by it.
 *
 * Trees with no recorded GPS coordinate are dropped by default; pass
 * --include-unmapped to keep them (lat/lon null). species_binomial/
 * species_cultivar run through the standard processSpecies() pipeline;
 * name_vernacular keeps the source's own name where present, falling back
 * to registry.json only where missing. See cities/trompenburg.js for more
 * on all of the above — identical behaviour, shared implementation.
 *
 * Usage:
 *   node cities/bomenmuseum-gimborn.js                    # full fetch → data/bomenmuseum-gimborn.db
 *   node cities/bomenmuseum-gimborn.js --format json
 *   node cities/bomenmuseum-gimborn.js --include-unmapped
 *   node cities/bomenmuseum-gimborn.js --letters ab        # debug: only these starting letters
 *   node cities/bomenmuseum-gimborn.js --term "Fagus"      # debug: one exact search term
 *   node cities/bomenmuseum-gimborn.js -d                  # dry run, print JSON, no file written
 */

import { runCli } from '../lib/collectie-gimborn.js';

// The shared database's four institutions form four distinct, well-separated
// geographic clusters — a margin around Gimborn's observed specimen cluster
// (lat 52.0296–52.0350, lon 5.3036–5.3127 from a sample fetch), same approach
// as cities/trompenburg.js.
const GIMBORN_BBOX = { latMin: 52.00, latMax: 52.06, lonMin: 5.27, lonMax: 5.34 };

runCli({
    cityId: 'bomenmuseum-gimborn',
    arboretumIndex: 0,      // "Nationaal Bomenmuseum Gimborn" within cbArboreta
    growthFormIndex: null,  // no growth-form step in this institution's own search flow
    bbox: GIMBORN_BBOX,
}).catch(err => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
});
