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
// geographic clusters — this bbox is a margin around Trompenburg's own cluster,
// used to exclude the other three institutions' specimens (the cbArboreta
// checkbox has no server-side effect — see collectie-gimborn.js).
//
// latMin is deliberately raised to 51.90, above Trompenburg's actual garden
// (lat 51.918-51.9225, lon 4.5166-4.5228), to also exclude a second cluster of
// ~130 specimens ~4km south (lat 51.883-51.888, lon 4.595-4.599; accession
// codes like "HTD1A-025", vs. the main garden's "KY-xxx" plots). Checked on
// satellite imagery — these look like real, planted trees, not bad geocoding,
// so the working theory is a second, off-site nursery/growing location that
// shares Trompenburg's collection records rather than a data error. Excluding
// it isn't just cosmetic: a bbox spanning both clusters would engulf a large
// empty area between them (nothing exists for lat 51.90-51.915), and the
// app's dataset-switching logic (bbox-based) would treat any point in that
// empty gap as "inside Trompenburg" — reproduced by panning east from
// Rotterdam while staying north of the real garden, which incorrectly
// switched the active dataset to Trompenburg despite the garden never being
// on screen. If this second cluster should actually be shown on the map one
// day, it needs its own separate bbox/city entry rather than being folded
// back into Trompenburg's.
const TROMPENBURG_BBOX = { latMin: 51.90, latMax: 51.93, lonMin: 4.50, lonMax: 4.61 };

runCli({
    cityId: 'trompenburg',
    arboretumIndex: 2,   // "Trompenburg Tuinen & Arboretum" within cbArboreta
    growthFormIndex: 0,  // "WOODY" within cbSoortGewas
    bbox: TROMPENBURG_BBOX,
}).catch(err => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
});
