# open-data-fetcher

Fetches all municipal trees from Dutch cities' public WFS services and writes
them to local SQLite files for use by the web-app API. Includes tooling to
build vernacular name lookup databases from multiple sources.

**Cities:** Rotterdam · Amsterdam · Den Haag · Groningen · Utrecht · Arnhem · Nijmegen · Zwolle · Eindhoven · Amersfoort · Breda · Assen · Delft · Haarlem · Zandvoort · Oss  
**License:** Creative Commons Public Domain Mark 1.0

---

## Prerequisites

- Node.js ≥ 18
- `npm install`

---

## Usage

### Fetching city tree data

```sh
# All cities, full datasets → SQLite (recommended)
node index.js --city all --all

# Single city
node index.js --city rotterdam --all

# Sample: first 100 trees (default), print to console
node index.js --city rotterdam -d

# Specific count and page
node index.js --city rotterdam --count 500 --page 2

# Different layer
node index.js --city rotterdam --all --layer ms:obs_bmn_bijz
```

### Arguments

| Argument | Default | Description |
|---|---|---|
| `--city NAME` | — | Comma-separated list of city IDs to fetch |
| `--all` | off | Fetch entire dataset in pages of 1000 |
| `--count N` | 100 | Number of trees to fetch (single request) |
| `--page N` | 0 | Page offset when using `--count` |
| `--format json\|sqlite` | `sqlite` | Output format |
| `--layer NAME` | `ms:obs_bmn_alg` | WFS layer to query (Rotterdam only) |
| `-d` | off | Dry run — print JSON to stdout, write no file |

### Output files

Output is written to `data/<city>.db` (e.g. `data/rotterdam.db`).

### Vernacular name tools

```sh
# Fetch iNaturalist vernacular names for all species → data/vernacular-base.db
npm run fetch-vernacular-base

# Build Dutch name DB from Wikipedia + Bomenbieb + city DB votes → data/vernacular-nl.db
npm run merge-vernacular-nl

# Low-level: aggregate votes only (no web sources) → data/vernacular-nl.db
npm run build-vernacular-nl
```

### Species quality tools

```sh
# Compare current pipeline output against what's stored in each city DB
# (only reports species whose stored binomial would now differ; won't
# catch species that fail to resolve at both fetch time and now — see below)
npm run validate-pipeline

# Re-apply overrides.js corrections to city DBs in-place (no re-import needed)
npm run patch-binomials
npm run patch-binomials -- --dry       # preview changes without writing
npm run patch-binomials -- --city amsterdam
```

After running, copy the resulting `.db` files into `api/data/` alongside the city databases (`npm run copy-data`).

**Known gap:** `tools/validate-species.js` — which used to flag species that
fail to resolve *at all* for a freshly-fetched city (so a human could add an
`overrides.js`/`registry.json` entry before the data goes live) — was
removed in the registry-based pipeline rewrite without a replacement.
`validate-pipeline` above and `patch-binomials --dry` both only surface
species whose resolution *changes* relative to what's already stored, which
is empty right after a fresh fetch (the stored value already reflects the
current pipeline). `add-city.js` still calls the deleted script by name and
will error at that step. Checking a newly-fetched city's unresolved species
today means querying its DB directly for `species_binomial IS NULL`.

### Non-WFS sources: Von Gimborn Arboretum collection database

Four institutions share one collection database at `collectie.gimbornarboretum.nl`
with no public API — a legacy ASP.NET WebForms + Telerik app driven entirely by
postbacks. `lib/collectie-gimborn.js` replays that choreography (session
bootstrap → autocomplete round-trip → search postback, chaining the
ViewState/EventValidation each response returns) rather than using WFS
`GetFeature`, so each institution gets a thin `cities/<id>.js` wrapper around
the shared client rather than a `config.js`/`CITIES` entry — the fetch/
pagination model doesn't fit `index.js`'s WFS-oriented engine, so these are
invoked directly instead. Full protocol notes are in `lib/collectie-gimborn.js`'s
header comment; per-institution specifics live in each `cities/<id>.js`.

Shared behaviour across all institutions on this database:

- The site's own institution-selection checkbox has no effect on which
  specimens the search returns (confirmed empirically — selecting a different
  institution index for the same term returns byte-identical results, only the
  map's cosmetic label differs). Each wrapper instead filters to that
  institution's own geographic bounding box, since the four institutions'
  specimens form four distinct, well-separated coordinate clusters.
- Coverage comes from searching every letter a–z (substring matching against
  each specimen's full name), not from `registry.json`, since these are
  specialist collections likely to include species/genera the
  municipal-derived registry has never seen.
- species_binomial/species_cultivar run through the standard `processSpecies()`
  pipeline, same as every other city fetcher — these collections surface more
  unresolved/fuzzy matches than municipal street-tree data does (see the
  "Known gap" note under "Species quality tools" for how to check for these
  now that `validate-species.js` is gone).
- `name_vernacular` keeps the source's own name where present; only missing
  ones are filled in from `registry.json` — existing source data always wins.
- Requires Node ≥ 22 with `--use-system-ca` if outbound TLS to this host fails
  certificate verification in your environment (seen in sandboxed dev setups).

All four institutions on this database are now fetched and registered in
`api/cities.json`, each with `mapZoom`/`clusterDisableZoom` overrides (see
"Per-city map zoom / clustering overrides" below) since all four are small,
dense sites where the global defaults would leave them looking like a dot
zoomed out, or dump thousands of individual DOM markers at once zoomed in.

#### Trompenburg Tuinen & Arboretum (Rotterdam)

**Status: fetched (3,281 trees) and registered in `api/cities.json`.** Many
specimens share exact-identical coordinates — Trompenburg positions trees at
the "plantvak" (planting-section) level rather than surveying each one
individually. This isn't a fetcher bug; the coordinates genuinely are that
coarse in the source. It made this dataset unusable at first (fully
overlapping, unclickable markers once zoom disabled clustering) and it was
shelved for a while — see git history around "shelve Trompenburg" — until
the app's own marker layer gained coordinate-collision grouping
(`MapController.ts`'s `groupByCoordinate`/`onGroupMarkerClick`), which turns
an exact-coordinate collision into one clickable group marker instead of
stacked individual ones. Re-registered once that landed.

```sh
node cities/trompenburg.js                    # full fetch → data/trompenburg.db
node cities/trompenburg.js --format json
node cities/trompenburg.js --include-unmapped  # also keep specimens with no recorded coordinate
node cities/trompenburg.js --term "Fagus"      # debug: one exact search term
node cities/trompenburg.js -d                  # dry run, print JSON, no file written
```

Institution-specific: `arboretumIndex: 2`, `growthFormIndex: 0` ("WOODY" —
confirmed to actually filter correctly, unlike the institution checkbox).

#### Nationaal Bomenmuseum Gimborn (Doorn)

**Status: fetched (3,169 trees) and registered in `api/cities.json`.**
Coordinates here are individually granular — only 26 of 3,169 specimens
share a coordinate with another (max 5-way collision), vs. Trompenburg's
pervasive plantvak-level duplication.

This institution's own manual search flow has no growth-form ("WOODY" etc.)
selection step at all — `growthFormIndex: null` in `cities/bomenmuseum-gimborn.js`
skips that postback entirely, and nothing in the fetched data suggests
non-woody specimens are slipping through (genus breakdown is entirely trees
and shrubs).

```sh
node cities/bomenmuseum-gimborn.js
node cities/bomenmuseum-gimborn.js --format json
node cities/bomenmuseum-gimborn.js --include-unmapped
node cities/bomenmuseum-gimborn.js --term "Fagus"
node cities/bomenmuseum-gimborn.js -d
```

#### Pinetum Ter Borgh (Anloo)

**Status: fetched (225 trees) and registered in `api/cities.json`.** The
smallest and most dense of the four — the whole site is under 200m across.
`growthFormIndex: null`, same as Gimborn, but here it's an **assumption**
carried over rather than independently confirmed: Ter Borgh is a "pinetum"
(conifer-only collection), so a WOODY/PERENNIAL/SUCCULENT distinction seems
unlikely to matter in its own manual search flow, but this hasn't been
checked directly against the real site the way Gimborn's absence of that
step was. Genus breakdown is entirely conifers (Juniperus, Chamaecyparis,
Thuja, Abies, Picea, ...), consistent with that assumption holding.

```sh
node cities/pinetum-ter-borgh.js
node cities/pinetum-ter-borgh.js --format json
node cities/pinetum-ter-borgh.js --include-unmapped
node cities/pinetum-ter-borgh.js --term "Pinus"
node cities/pinetum-ter-borgh.js -d
```

Institution-specific: `arboretumIndex: 3`.

#### Pinetum de Dennenhorst (Lunteren)

**Status: fetched (349 trees) and registered in `api/cities.json`.** Same
`growthFormIndex: null` assumption as Ter Borgh (also a conifer-only
"pinetum", not independently confirmed) — genus breakdown is again entirely
conifers (Chamaecyparis, Juniperus, Picea, Taxus, Pinus, ...).

```sh
node cities/pinetum-dennenhorst.js
node cities/pinetum-dennenhorst.js --format json
node cities/pinetum-dennenhorst.js --include-unmapped
node cities/pinetum-dennenhorst.js --term "Pinus"
node cities/pinetum-dennenhorst.js -d
```

Institution-specific: `arboretumIndex: 1`.

### Non-WFS sources: GRIB viewer platform (bomenwacht.nl)

`viewer.bomenwacht.nl` is a white-labelled instance of a generic tree/asset
inventory product ("GRIB", `*.grib.app`) — an Angular SPA backed by Azure
Functions, unrelated to the Von Gimborn collection database above. No public
API; the fetcher replays the two calls the viewer's own JS bundle makes,
using the same client-side function key every viewer build embeds
(`environment.appFunctionKey` in `main-*.js`).

Protocol, resolved once per site and hardcoded rather than re-resolved on
every run (the mapping from share code to internal ID is stable):

1. `GET start/{shareCode}?code={functionKey}` — resolves the public share
   code from the viewer URL (e.g. `?code=DNO1oqxV6qBv`) to a numeric
   `keten_id` plus the org's field-label config.
2. `GET start/keten/{keten_id}?code={functionKey}` — the full tree array in
   one uncapped response, no pagination.

Unlike the Gimborn institutions (a genuine postback/session/pagination
protocol that doesn't fit `index.js`'s WFS-shaped loop), this fits the
`singleFetch` path perfectly — one URL, one uncapped JSON response, same
shape as `cities/apeldoorn.js`'s ZIP fetch. It's registered normally in
`config.js`. The one wrinkle: this URL already carries its own
`?code=...`, and `index.js`'s `singleFetch` path always used to append a
bare `?` for non-paginated fetches — which would land inside the auth key's
value and 401 (confirmed live). Fixed in `lib/http.js`'s `fetchRaw()`:
it now joins with `&` when the URL already contains `?`, and skips the join
entirely when there are no extra params — a small, backward-compatible
change (no other city's `wfsUrl` contains `?`, so nothing else changes
behaviour).

Coordinates come back as EPSG:3857 (Web Mercator) — a plain spherical
inverse projection is exact here (no proj4/datum grid needed, unlike RD New).

#### Arboretum De Nieuwe Ooster (Amsterdam)

**Status: fetched (2,972 trees) and registered in `api/cities.json`.** A
cemetery park with an arboretum collection — trees are positioned relative
to grave-plot sections rather than street addresses, so `custom_four`
("Grafvak") is mapped to `street` as the closest equivalent, same role it
plays for the Gimborn institutions' path/section numbers. `custom_five`
("Herkomst" / origin) has no equivalent column in this project's tree schema
and is dropped. 17 records with administrative/placeholder species values
were dropped by the standard `processSpecies()` pipeline; ~45 more have
`species_binomial: null` because the source itself marks them `"Onbekend"`
or with a trailing `?` (uncertain identification — both already handled by
existing `overrides.js` rules, not new ones added for this source).

Being a normal `config.js` entry (unlike the standalone Gimborn fetchers),
this one is picked up automatically by `add-city.js`, `patch-binomials.js`,
and `tools/vernacular/base/fetch.js` — no separate CLI or manual vernacular
step needed:

```sh
node index.js --city de-nieuwe-ooster --all
node index.js --city de-nieuwe-ooster --all --format json
node index.js --city de-nieuwe-ooster    # sample 100, dry-run
```

#### Bergen (NH) — bijzondere en monumentale bomen

**Status: fetched (4,114 trees) and registered in `api/cities.json`.** Unlike
De Nieuwe Ooster, this org populates the platform's named fields directly
(`soort`, `soort_nl`, `straat`, `buurt`, `diameterklasse`) rather than the
generic `custom_*` slots. `diameterklasse` is a class range (e.g. `"50 -
100"`), not a precise measurement — parsed to a metre midpoint the same way
as Deventer's `i_stamdiameterklasse` (see `parseDiameterClass` in both
files). `custom_one` carries the special/monumental status ("Bijzonder" /
"Monumentaal" / "Monumentaal (landelijk)") that justified each tree's
inclusion in this curated list in the first place — this is a subset of
Bergen's trees (those on the municipal special/monumental tree register),
not the full municipal tree stock, hence the distinct
`bergen-monumentale-bomen` id rather than plain `bergen`. Registered as
`type: "city"` (spread across the whole municipality, not a single dense
site) rather than `"institution"`.

Found via Bomenwacht's own project showcase page rather than a link supplied
directly by an end user of this project — same "organisation publishes a
public viewer link" pattern as De Nieuwe Ooster, so treated with the same
posture. Other share codes turned up by web search with no identifiable
public source page were deliberately left unresolved: the platform's
function key is shared across every organisation on it, so fetching an
org's data on the strength of a bare code, with no visible "this org meant
to share this" trail, isn't something this project does.

While investigating this source, found and fixed an unrelated pre-existing
bug in `overrides.js`: the `unknownTerms` pattern `/\bDIVERS/i` (meant to
catch the Dutch administrative placeholder "divers"/"diverse"/"diversen")
also matched inside real species names — "Fraxinus excelsior 'Diversifolia'"
and "Tsuga diversifolia" — wrongly nulling their `species_binomial` in four
already-registered cities (Rotterdam, Bomenmuseum Gimborn, Pinetum de
Dennenhorst, Trompenburg) as well as in this new Bergen data. Tightened to
`/\b(DIVERS|DIVERSE|DIVERSEN)\b/i` and re-ran `npm run patch-binomials`
across all cities to apply the fix.

```sh
node index.js --city bergen-monumentale-bomen --all
```

### Per-city map zoom / clustering overrides

`api/cities.json` entries may carry optional `mapZoom` and `clusterDisableZoom`
fields (see `app/src/types.ts`'s `City` type), overriding `app/src/config.ts`'s
`MAP_ZOOM`/`CLUSTER_DISABLE_ZOOM` globals for that one city — `mapZoom` for
how far to zoom in when flying to the city's center, `clusterDisableZoom` for
the zoom at/above which the map stops clustering and renders individual
markers. Only set where they deviate from the default; most (municipal)
cities don't need either. All five institutions above (the four on the
Gimborn collection database, plus De Nieuwe Ooster) set both, since each is a
small, dense site where the defaults would either leave it looking like a
dot when flown to, or dump many individual DOM markers at once past the
default clustering cutoff.

### End-to-end pipeline for a new (or refreshed) city

Once `cities/<id>.js` exists and is registered in `config.js`, run the whole
fetch → override-check → patch → vernacular → copy sequence in one go:

```sh
node add-city.js --city utrecht

# Multiple cities in one run — global steps (patch/vernacular/copy) run once
# for the whole batch instead of once per city
node add-city.js --city utrecht,arnhem,nijmegen

# Skip the "continue? [Y/n]" prompts between steps
node add-city.js --city utrecht,arnhem --yes
```

Steps: check each city up front for an existing `data/<city>.db` — if found,
asks whether to refetch (`[y/N]`, declining reuses the file on disk) — then
fetch full dataset(s) for whichever cities need it → `validate-species` for
the given city/cities → (pause here if it suggests `overrides.js` entries —
paste them in manually, then press Enter) → patch binomials → rebuild
vernacular names → `copy-data`.

**Currently broken:** the `validate-species` step calls a script that no
longer exists (see "Known gap" under "Species quality tools") — running
`add-city.js` will error there. Skip past it manually or check the DB
directly for `species_binomial IS NULL` before that step.

Under `--yes`, the existing-data check defaults to **not** refetching — the
point of `--yes` there is to skip needless network calls, not to force a
refetch.

The patch step asks for a scope rather than a plain yes/no: `[a]ll` cities,
`[n]ewly added only` (the cities passed via `--city`, and the default — a
correction found for this batch is usually only relevant to it), or
`[s]kip`. `--yes` defaults to "newly added only".

The override-review pause is not skipped by `--yes` — pasting suggested
corrections into `overrides.js` requires a human judgment call (especially
entries flagged `// fuzzy`), so the script always stops and waits for Enter
when `validate-species` produces output.

---

## Available layers

| Layer | Description |
|---|---|
| `ms:obs_bmn_alg` | All trees (default) |
| `ms:obs_bmn_bijz` | Trees with a special designation |
| `ms:obs_bmn_bos` | Trees in forest plantings |
| `ms:obs_bmn_gesl` | Trees grouped by genus |
| `ms:obs_bmn_kroon` | Trees with crown projection data |

---

## Output schema

Each tree record contains:

| Field | Type | Notes |
|---|---|---|
| `lat` | float | WGS84 latitude |
| `lon` | float | WGS84 longitude |
| `id` | string | Municipality's internal tree ID |
| `year_planted` | string | e.g. `"1993"` |
| `name_vernacular` | string\|null | Sanitised Dutch common name from source, e.g. `"ZOMEREIK"` |
| `species` | string | Original full value from source, e.g. `"QUERCUS ROBUR 'FASTIGIATA KOSTER'"` |
| `species_binomial` | string\|null | Extracted binomial, e.g. `"QUERCUS ROBUR"` or `"ACER × FREEMANII"` |
| `species_cultivar` | string\|null | Extracted cultivar/trade name, e.g. `"FASTIGIATA KOSTER"` |
| `neighbourhood` | string | Neighbourhood / district |
| `street` | string | |
| `trunk_diameter` | string | Metres, e.g. `"0.49"` |
| `crown_spread` | string | Metres, e.g. `"11"` |

The SQLite database also carries indexes on `(lat, lon)`, `species`,
`species_binomial`, and `(species_binomial, species_cultivar)`.

---

## Vernacular name tools

Three scripts under `tools/vernacular/` build the name lookup databases that the
API serves via `GET /api/vernacular-names`.

### `tools/vernacular/base/fetch.js`

Fetches vernacular names in multiple languages for every species found across
all city databases, using the [iNaturalist V1 API](https://api.inaturalist.org/v1/).

**Two-call pattern per species:**
1. `GET /taxa?q={binomial}&rank=species` — resolve to a taxon ID
2. `GET /taxa/{id}?all_names=true` — fetch all vernacular names

A genus-level fallback applies if step 1 fails: iNat lists all species in the
genus and the closest epithet (edit distance ≤ 2) is accepted. Only runs when
the genus already appears in the registry, avoiding wasted calls for made-up names.

Rate-limited to ~85 requests/minute (under iNaturalist's 100/min cap). Results
are written directly into `registry.json` under a `vernacular: { nl, en, de, fr }`
field. Species not found on iNat are marked `inat_id: null` and skipped on
subsequent runs. Use `--no-cache` to retry them. Full run over ~1 000 species
takes ~23 minutes.

**Output:** `data/vernacular-base.db`

```sql
CREATE TABLE vernacular_base (
    species_binomial TEXT PRIMARY KEY,  -- e.g. "Quercus robur"
    inat_id          INTEGER,
    nl               TEXT,              -- Dutch
    en               TEXT,              -- English
    de               TEXT,              -- German
    fr               TEXT               -- French
)
```

### `tools/vernacular/nl/merge.js`

Builds a curated Dutch vernacular name database by merging four sources in
priority order:

1. **Overrides** — `tools/vernacular/nl/overrides-nl.js` (see below)
2. **Wikipedia** — [Lijst van boomsoorten in Nederland](https://nl.wikipedia.org/wiki/Lijst_van_boomsoorten_in_Nederland)
3. **Bomenbieb** — bomenbieb.nl species catalogue
4. **Database votes** — majority-voted names from all city tree databases

Also stores a `source` column (`'override' | 'wikipedia' | 'bomenbieb' | 'databases'`)
and a `name_vernacular_alt` for genuine alternative names (where a runner-up got
at least 25 % of the winning vote count and is not a substring of the winner).

**Output:** `data/vernacular-nl.db`

```sql
CREATE TABLE vernacular_nl (
    species_binomial    TEXT PRIMARY KEY,
    name_vernacular     TEXT NOT NULL,
    name_vernacular_alt TEXT,
    source              TEXT   -- 'override' | 'wikipedia' | 'bomenbieb' | 'databases'
)
```

Web-scraped sources are cached in `tools/vernacular/nl/sources/` (Wikipedia and
Bomenbieb JSON); pass `--no-cache` to force a fresh fetch.

### `tools/vernacular/nl/overrides-nl.js`

A curated map of uppercase `species_binomial → preferred Dutch name` that takes
priority over all automated sources (Wikipedia, Bomenbieb, database votes). Use
this to correct names that automated sources get wrong, e.g. preferring
`'Magnolia'` over the Wikipedia name `'Beverboom'`.

Adding or changing an override does **not** require a city database re-fetch.
Only `npm run merge-vernacular-nl && npm run copy-data` is needed.

### `tools/vernacular/nl/build.js`

Lower-level variant of the merge script: aggregates only the database votes
(no web fetches) and writes the same `vernacular-nl.db` schema. Useful for
testing the vote-resolution logic without hitting the web.

---

## Data quality: fixing misspelled species names

Source databases contain misspelled binomials (e.g. `ACER FREMANII` instead of
`ACER FREEMANII`). The resolution pipeline in `lib/species.js` catches most of
these automatically via `registry.json`, but occasionally a new misspelling
surfaces that falls outside fuzzy-match range.

### `registry.json` — single source of truth

`registry.json` in the fetcher root is the authoritative list of known species.
Each entry is keyed by the **canonical binomial** (uppercase, `GENUS EPITHET`)
with the following fields:

```json
"AESCULUS HIPPOCASTANUM": {
  "inat_id": 84298,
  "vernacular": { "nl": "Witte Paardenkastanje", "en": "horse-chestnut", "de": "...", "fr": "..." },
  "aliases": ["AESCULUS HI", "AESCULUS HIPP.", "AESCULUS HIPPOCASTANNUM"]
}
```

- **`inat_id`** — iNaturalist taxon ID; `null` means "looked up, not found on iNat"
- **`vernacular`** — multilingual names fetched via iNat (written by `fetch.js`)
- **`aliases`** — raw source forms that should resolve to this canonical
- **`_genusCorrections`** — map of misspelled genus → correct genus (applied before lookup)

### Fixing a misspelling

1. **Add an alias** to the correct canonical entry in `registry.json`:
   ```json
   "ACER FREEMANII": { "aliases": ["ACER FREMANII"] }
   ```
   For genus-level misspellings, add to `_genusCorrections` instead:
   ```json
   "_genusCorrections": { "METASQUOIA": "METASEQUOIA" }
   ```

2. **Patch city databases** to propagate the correction:
   ```sh
   npm run patch-binomials
   npm run patch-binomials -- --dry    # preview first
   ```
   Re-applies `processSpecies()` to the stored raw `species` field in every city
   DB and updates `species_binomial` / `species_cultivar` in-place. No re-fetch
   needed. Fuzzy resolutions are printed at the end — consider promoting them to
   explicit aliases.

3. **Fetch vernacular for newly-resolved species** (if any were previously unresolved):
   ```sh
   npm run fetch-vernacular-base
   ```

4. **Rebuild and deploy:**
   ```sh
   npm run merge-vernacular-nl
   npm run copy-data
   ```

---

## Design notes

### WFS, not scraping
Rotterdam publishes its tree register through a standard OGC Web Feature
Service (WFS 2.0.0). The fetcher uses `GetFeature` requests rather than
scraping a website, which makes it stable against layout changes and
explicitly within the intended use of the open-data licence.

### PROPERTYNAME filtering
The WFS `PROPERTYNAME` parameter limits which fields the server serialises
into each GML response. Only the ~10 fields we actually use are requested,
which meaningfully reduces payload size compared to fetching the full ~30-field
feature.

The geometry field is named `GEOM` in this service (confirmed via
`DescribeFeatureType`). Not `msGeometry` as MapServer uses by default — the
layer has a custom schema.

### Coordinate conversion: EPSG:28992 → WGS84
Rotterdam's WFS returns coordinates in RD New (Rijksdriehoekstelsel,
EPSG:28992), the Dutch national grid. `proj4` converts these to WGS84
(lat/lon) at import time so the API and frontend never need to know about RD.

### Encoding workaround
The server's XML declaration claims `UTF-8`, but the response body contains
ISO-8859-1 bytes (e.g. `Ö` as `0xD6`, which is invalid UTF-8 when followed by
a regular ASCII byte). Decoding as `latin1` is lossless for any single-byte
encoding — byte `0xNN` maps to Unicode `U+00NN` — and silently produces correct
characters regardless of the server's declaration.

### Species sanitisation pipeline
Raw species strings from the source are inconsistent: cultivar names appear in
various formats (`'NAME'`, `(CODE)`, bare suffix words), some entries are
administrative placeholders (`ASSORTIMENT ONBEKEND`, `OVERIG`), and there are
known typos (`METASQUOIA`, `PTEROCAYRA`).

The pipeline applied to every tree at import time (`lib/species.js`):

1. **Filter** — `dropTerms` in `overrides.js` matches administrative
   placeholders; the record is dropped entirely. `unknownTerms` matches
   genuinely unknown species; the tree is kept with `species_binomial = null`.
2. **`species_binomial` extraction** — strips cultivar suffixes, rank markers
   (`subsp.`, `var.`, `f.`), and parentheticals, leaving the clean two-word
   (or hybrid `×`) candidate.
3. **Genus correction** — `registry._genusCorrections` replaces misspelled
   genus names (e.g. `METASQUOIA → METASEQUOIA`) before lookup.
4. **Registry lookup** — exact match or alias match in `registry.json`.
5. **Fuzzy match** — Levenshtein on genus (≤ 1) and epithet (≤ 2) against all
   registry keys. Catches remaining one- or two-character typos.
6. **Store as-is** — species not in registry and not fuzzily matched are stored
   verbatim (valid but unverified — no iNat metadata yet).
7. **`species_cultivar` extraction** — prefers ICNCP codes in parentheses
   `('CODE')`, falls back to quoted names `'NAME'`, then bare suffix words.
8. **`name_vernacular` sanitisation** — strips leading-dash admin entries,
   ` -` admin suffixes, and trailing `(CV)` / `(V)` markers.

All cleaning logic for species identification lives here in the fetcher. Dutch
vernacular name preferences are handled separately in
`tools/vernacular/nl/overrides-nl.js` and applied during the merge step, so
they can be updated without a city re-fetch. The API and frontend receive only
clean, typed values and have no knowledge of source-specific quirks.

### sql.js instead of better-sqlite3
`better-sqlite3` is the most ergonomic SQLite library for Node but requires
native compilation (`node-gyp`). `sql.js` is SQLite compiled to WebAssembly
and ships as pure JavaScript — no build tools, no Visual Studio, works
everywhere npm does. The trade-off is that `sql.js` builds the entire database
in memory before writing it to disk, which is fine for ~200k rows but would
be a concern for much larger datasets.

### Paged fetching
WFS services cap results per request (typically 1000). `--all` uses
`STARTINDEX` pagination and a `resultType=hits` pre-flight to get the total
count, which drives the progress bar. Progress updates after each parsed page,
not after each HTTP chunk, so the bar reflects actual usable records rather
than raw bytes.
