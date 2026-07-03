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
# Check for stale binomials and unresolvable species; suggest overrides.js entries
npm run validate-species

# Re-apply overrides.js corrections to city DBs in-place (no re-import needed)
npm run patch-binomials
npm run patch-binomials -- --dry       # preview changes without writing
npm run patch-binomials -- --city amsterdam
```

After running, copy the resulting `.db` files into `api/data/` alongside the city databases (`npm run copy-data`).

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
  pipeline, same as every other city fetcher — run `npm run validate-species`
  afterwards, since these collections surface more unresolved/fuzzy matches
  than municipal street-tree data does.
- `name_vernacular` keeps the source's own name where present; only missing
  ones are filled in from `registry.json` — existing source data always wins.
- Requires Node ≥ 22 with `--use-system-ca` if outbound TLS to this host fails
  certificate verification in your environment (seen in sandboxed dev setups).

#### Trompenburg Tuinen & Arboretum (Rotterdam)

**Status: fetched, but not currently registered in `api/cities.json`.** Many
specimens share exact-identical coordinates — Trompenburg positions trees at
the "plantvak" (planting-section) level rather than surveying each one
individually. On the map this renders as multiple, sometimes many, trees
stacked on the exact same point: below `CLUSTER_DISABLE_ZOOM` they merge into
one cluster count (masking that they're distinct trees at all), and at/above
it they render as fully overlapping, unclickable individual markers. This
makes the dataset unusable for this app's per-tree map view as-is — it isn't
a fetcher bug, the coordinates genuinely are that coarse in the source.
Considered and rejected for now: deterministically jittering coincident
points at render time to spread them apart, since that wasn't pursued further
once the decision was made to shelve this source. (See also, unrelated but
noted during the same investigation: a small, dense arboretum in a tiny area
would separately cause many-DOM-marker lag once zoom disables clustering —
a generic scalability concern for any future dense/small-area source, since
`CLUSTER_DISABLE_ZOOM` etc. are single global constants with no per-city
override today.)

The fetcher, species processing, and `data/trompenburg.db` are all intact —
only the `api/cities.json` entry was removed. To resume:

```json
{
  "id": "trompenburg",
  "name": "Trompenburg",
  "center": [51.9188, 4.5192],
  "meta": { "source": "collectie.gimbornarboretum.nl" }
}
```

Paste that back into `api/cities.json` (and re-run `npm run copy-data` if
`data/trompenburg.db` has since gone stale) to pick this back up — ideally
alongside an actual fix for the coordinate-collision problem above.

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
Unlike Trompenburg, coordinates here are individually granular — only 26 of
3,169 specimens share a coordinate with another (max 5-way collision), vs.
Trompenburg's pervasive plantvak-level duplication — so this dataset doesn't
appear to hit the same blocker.

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

#### Adding Pinetum de Dennenhorst or Pinetum Ter Borgh

Not yet implemented. Both share the same database and protocol — a new
`cities/<id>.js` following `cities/bomenmuseum-gimborn.js`'s pattern (a
`runCli()` call into `lib/collectie-gimborn.js` with that institution's
`arboretumIndex` — 1 for Dennenhorst, 3 for Ter Borgh — plus a geographic
`bbox` derived the same way: fetch a sample term, inspect the coordinate
spread, set a bounding box with margin) should be most of the work. Confirm
whether each has a growth-form selection step in its own manual search flow
before deciding `growthFormIndex`.

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
