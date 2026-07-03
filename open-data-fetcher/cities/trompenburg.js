#!/usr/bin/env node
/**
 * Fetches the Trompenburg Tuinen & Arboretum collection from the shared
 * Von Gimborn Arboretum collection database. See lib/collectie-gimborn.js
 * for the protocol details (no public API — this replays an ASP.NET
 * WebForms postback flow) and the reverse-engineering trail.
 *
 * Trees with no recorded GPS coordinate (confirmed to exist — the "Toon details"
 * popup for some List-view rows shows no marker) are dropped by default, since
 * this app's map is viewport/bbox driven and a null-coordinate row is otherwise
 * inert. Pass --include-unmapped to keep them (lat/lon null) for other uses, e.g.
 * a full species checklist.
 *
 * species_binomial/species_cultivar run through the standard processSpecies()
 * pipeline (lib/species.js), same as every other city fetcher — entries matching
 * overrides.js dropTerms are dropped, reported as `filtered_species`. Being an
 * arboretum collection, expect more unresolved/as-is binomials and fuzzy matches
 * here than for municipal street-tree data; run `npm run validate-species` after
 * fetching to review.
 *
 * name_vernacular keeps Trompenburg's own "volksnaam" where present; only
 * missing ones are filled in from registry.json's Dutch vernacular names —
 * existing source data always wins over the registry.
 *
 * Usage:
 *   node cities/trompenburg.js                    # full fetch → data/trompenburg.db
 *   node cities/trompenburg.js --format json
 *   node cities/trompenburg.js --include-unmapped  # also keep coordinate-less specimens
 *   node cities/trompenburg.js --letters ab        # debug: only these starting letters
 *   node cities/trompenburg.js --term "Fagus"      # debug: one exact search term
 *   node cities/trompenburg.js -d                  # dry run, print JSON, no file written
 */

import { runCli } from '../lib/collectie-gimborn.js';

// The shared database's four institutions form four distinct, well-separated
// geographic clusters — a small ~0.04° margin around Trompenburg's observed
// specimen cluster (also incidentally drops a handful of source records with
// corrupt/swapped coordinates).
const TROMPENBURG_BBOX = { latMin: 51.87, latMax: 51.93, lonMin: 4.50, lonMax: 4.61 };

runCli({
    cityId: 'trompenburg',
    arboretumIndex: 2,   // "Trompenburg Tuinen & Arboretum" within cbArboreta
    growthFormIndex: 0,  // "WOODY" within cbSoortGewas
    bbox: TROMPENBURG_BBOX,
}).catch(err => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
});
