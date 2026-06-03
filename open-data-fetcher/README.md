# open-data-fetcher

Fetches all municipal trees from Rotterdam's public WFS service and writes them
to a local JSON or SQLite file for use by the web-app API.

**Data source:** Gemeente Rotterdam, Beheer Buitenruimte  
**License:** Creative Commons Public Domain Mark 1.0  
**Dataset size:** ~200 000 trees (as of 2026), updated daily by the municipality

---

## Prerequisites

- Node.js ≥ 18
- `npm install`

---

## Usage

```sh
# Full dataset → SQLite (recommended for production)
node index.js --all --format sqlite

# Full dataset → JSON
node index.js --all --format json

# Sample: first 100 trees (default), print to console
node index.js -d

# Specific count and page
node index.js --count 500
node index.js --count 500 --page 2

# Different layer
node index.js --all --layer ms:obs_bmn_bijz
```

### Arguments

| Argument | Default | Description |
|---|---|---|
| `--all` | off | Fetch entire dataset in pages of 1000 |
| `--count N` | 100 | Number of trees to fetch (single request) |
| `--page N` | 0 | Page offset when using `--count` |
| `--format json\|sqlite` | `json` | Output format |
| `--layer NAME` | `ms:obs_bmn_alg` | WFS layer to query |
| `-d` | off | Dry run — print JSON to stdout, write no file |

### Output files

| Format | File |
|---|---|
| JSON | `bomen-rotterdam.json` |
| SQLite | `bomen-rotterdam.db` |

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
| `name_indigenous` | string\|null | Sanitised Dutch common name, e.g. `"ZOMEREIK"` |
| `species` | string | Original full value from source, e.g. `"QUERCUS ROBUR 'FASTIGIATA KOSTER'"` |
| `species_binomial` | string\|null | Extracted binomial, e.g. `"QUERCUS ROBUR"` or `"ACER × FREEMANII"` |
| `species_cultivar` | string\|null | Extracted cultivar/trade name, e.g. `"FASTIGIATA KOSTER"` |
| `genus` | string | e.g. `"QUERCUS"` |
| `neighbourhood` | string | Rotterdam wijk |
| `street` | string | |
| `trunk_diameter` | string | Metres, e.g. `"0.49"` |
| `crown_spread` | string | Metres, e.g. `"11"` |
| `last_updated` | string | `"YYYY-MM-DD HH:MM:SS"` |

The SQLite database also carries indexes on `(lat, lon)`, `species`,
`species_binomial`, and `(species_binomial, species_cultivar)`.

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

The pipeline applied to every tree at import time:

1. **NON_BOTANICAL filter** — records whose `species` is a known
   administrative placeholder are dropped entirely (not written to the DB).
2. **Typo correction** — a small explicit map fixes known source errors.
3. **`species_binomial` extraction** — strips cultivar suffixes, rank markers
   (`subsp.`, `var.`, `f.`), and parentheticals, leaving the clean two-word
   (or hybrid `×`) name.
4. **`species_cultivar` extraction** — prefers ICNCP codes in parentheses
   `('CODE')`, falls back to quoted names `'NAME'`, then bare suffix words.
5. **`name_indigenous` sanitisation** — strips leading-dash admin entries,
   ` -` admin suffixes, and trailing `(CV)` / `(V)` markers.

All cleaning logic lives here in the fetcher. The API and frontend receive only
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
