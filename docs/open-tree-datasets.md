# Open Tree Datasets — Dutch Cities

Research report on publicly available municipal tree datasets for potential inclusion in the fetcher.

---

## Den Haag

**Status:** Live ArcGIS MapServer query API — 127,370 trees (Straatboom layer)

The CKAN/data.overheid.nl ZIP downloads were found to be offline. Investigation of the ArcGIS web map (item `6cb9371f18584708b01723d9c72714c2`) revealed the actual source: a public ArcGIS MapServer on `geoservices.denhaag.nl`. Layer 0 (`Straatboom`) contains all municipal street trees, supports pagination, and returns WGS84 coordinates directly via `outSR=4326`.

| Resource | URL |
|----------|-----|
| MapServer layer 0 (Straatboom) | https://geoservices.denhaag.nl/arcgis/rest/services/V4_5_Natuur_en_milieu/Natuur_en_landschapsbeheer/MapServer/0 |
| Query endpoint | …/MapServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=json |
| ArcGIS web map | https://ddh.maps.arcgis.com/home/item.html?id=6cb9371f18584708b01723d9c72714c2 |
| CKAN (offline) | https://data.overheid.nl/dataset/bomen-json |

**Field mapping (source → schema):**

| Source field | Schema field | Notes |
|---|---|---|
| `BOOMNUMMER` | `id` | Tree registration number |
| `BOOMSOORT_WETENSCHAPPELIJ` | `species` | Full latin name incl. cultivar |
| `BOOMSOORT_NEDERLANDS` | `name_indigenous` | Dutch common name |
| `BUURT` | `neighbourhood` | Neighbourhood |
| `STRAATNAAM` | `street` | Street name |
| `LEEFTIJD` | `year_planted` | Age in years → `fetchYear − age` |
| `STAMDIAMETERKLASSE` | `trunk_diameter` | String range → midpoint (e.g. "50-75 cm" → 62.5) |
| geometry `x`/`y` | `lon`/`lat` | WGS84 when `outSR=4326` |
| — | `crown_spread` | Not available |
| — | `last_updated` | Not available |

- **SSL:** Incomplete certificate chain → `rejectUnauthorized: false`
- **License:** CC-0
- **Fetcher:** `cities/den-haag.js` ✅ implemented and tested

---

## Barendrecht

**Status:** Available via BAR-organisatie — CSV and Shapefile only

No WFS or GeoJSON endpoint. Static file downloads only. Same infrastructure as Albrandswaard.

| Format | URL |
|--------|-----|
| Shapefile (ZIP) | https://maps.bar-organisatie.nl/Online/Open%20Data%20Portaal/Barendrecht/Bomen/Bomen_barendrecht.zip |
| CSV | https://maps.bar-organisatie.nl/Online/Open%20Data%20Portaal/Barendrecht/Bomen/Bomen.CSV |
| WMS (view only) | https://maps.bar-organisatie.nl/arcgis/services/OpenDataPortaal/Bomen_BD/MapServer/WMSServer |

- **License:** CC-0
- **Data portal:** https://data.overheid.nl/en/dataset/5539-bomen-barendrecht
- **Contact:** open-data@bar-organisatie.nl

---

## Albrandswaard / Rhoon

**Status:** Available via BAR-organisatie — CSV and Shapefile only

Same infrastructure and same limitations as Barendrecht. Both are managed by the shared BAR regional organisation.

| Format | URL |
|--------|-----|
| Shapefile (ZIP) | https://maps.bar-organisatie.nl/Online/Open%20Data%20Portaal/Albrandswaard/Bomen/Bomen_Albrandswaard.zip |
| CSV | https://maps.bar-organisatie.nl/Online/Open%20Data%20Portaal/Albrandswaard/Bomen/BOMEN.csv |
| WMS (view only) | https://maps.bar-organisatie.nl/arcgis/services/OpenDataPortaal/Bomen_AW/MapServer/WMSServer |

- **License:** CC-0
- **Data portal:** https://data.overheid.nl/dataset/5903-bomen-albrandswaard
- **Contact:** open-data@bar-organisatie.nl

---

## Amsterdam

**Status:** Best-in-class REST API (~300,000 trees)

Amsterdam has a live REST API with GeoJSON streaming and WFS. Covers street trees, parks, and cemeteries across four data tables.

| Endpoint | URL |
|----------|-----|
| API documentation | https://api.data.amsterdam.nl/v1/docs/datasets/bomen.html |
| GeoJSON (stamgegevens) | https://api.data.amsterdam.nl/v1/bomen/stamgegevens/?_format=geojson |
| WFS | https://api.data.amsterdam.nl/v1/wfs/bomen/ |

Additional tables (all support `?_format=geojson`):
- `veiligheidsinspecties` — safety inspections
- `maatregelregistratie` — maintenance actions
- `kapenherplant` — tree removal and replanting

- **Tree count:** ~300,000
- **API key:** Required (mandatory since mid-2024, register at api.data.amsterdam.nl)

---

## Leeuwarden

**Status:** No full public dataset found

Leeuwarden has a bomenviewer app showing all municipal trees but no open-data download for the complete inventory. The only downloadable dataset covers monumental and valuable trees only (~754 trees).

| Resource | URL |
|----------|-----|
| ArcGIS Hub (open data portal) | https://portaal-gem-lwd.opendata.arcgis.com/ |
| Monumental + valuable trees (GeoJSON/CSV) | https://acc-ckannew.dataplatform.nl/dataset/gemeente-leeuwarden-bomen-monumentaal-waardevol-en-gedenk |
| Tree viewer (all trees, not downloadable) | http://www.groenleeftinleeuwarden.nl/bomenviewer |

The viewer is ArcGIS-based but the underlying FeatureServer does not appear to be publicly exposed. The full tree inventory may only be accessible by request from the municipality.

---

## Summary

| City | Full dataset | Format | Live API/WFS | License |
|------|-------------|--------|--------------|---------|
| Den Haag | Yes | GeoJSON ZIP, CSV ZIP, Shapefile | No (nightly static) | CC-0 |
| Barendrecht | Yes | CSV, Shapefile | No | CC-0 |
| Albrandswaard | Yes | CSV, Shapefile | No | CC-0 |
| Amsterdam | Yes | REST API / WFS | Yes | Open (API key needed) |
| Leeuwarden | Partial (monumental only) | GeoJSON, CSV | No | — |

---

# Implementation Inventory

## Architecture primer

The stack has three layers, each needing work per new city:

1. **Fetcher** (`open-data-fetcher/`) — a Node.js script that pulls data from the source API and writes a SQLite `.db` file. Each city is a module in `cities/<name>.js` that exports `wfsUrl`, `layer`, `outputFile`, `pageParams()`, `countParams()`, `parse()`, `parseCount()`, and optional `fetchOptions`. The core loop in `index.js` calls these methods via `lib/http.js` (a plain HTTPS GET that appends query params).

2. **API** (`api/`) — a PHP script serving `/cities`, `/trees`, `/species`, `/health`. Adding a city means dropping `bomen-<id>.db` into `api/` and adding an entry to `api/cities.json`. No PHP changes needed.

3. **App** (`app/`) — React/TypeScript frontend. Cities are loaded at runtime from `/api/cities`. No code changes needed per new city.

---

## Den Haag ✅

**Effort: Low** (turned out simpler than expected — live ArcGIS MapServer, fits existing architecture perfectly)

The CKAN ZIP was offline. Investigation revealed a public ArcGIS MapServer on `geoservices.denhaag.nl`. No ZIP handling needed; the existing `fetchRaw` GET + JSON parse pattern works directly.

### Fetcher
- [x] `cities/den-haag.js` — ArcGIS MapServer/0/query, paginated JSON, WGS84 via `outSR=4326`
- [x] `rejectUnauthorized: false` (incomplete cert chain, same as Rotterdam)
- [x] `parseDiameterClass()` — parses "50-75 cm" → 62.5 midpoint
- [x] `year_planted` derived as `fetchYear − LEEFTIJD`
- [x] Registered in `config.js`

### API
- [x] Entry added to `api/cities.json`
- [x] `api/bomen-den-haag.db` written (127,369 trees)

---

## Barendrecht

**Effort: Medium** — CSV or Shapefile download, same new fetcher pattern as Den Haag, field mapping unknown.

### Fetcher

Source is a **CSV** (preferred over Shapefile — no extra library needed) or a Shapefile ZIP. The CSV URL is a direct flat file download, no pagination.

- [ ] Decide: CSV vs Shapefile. CSV is simpler; Shapefile needs a library (e.g. `shapefile`) and coordinate reprojection if not WGS84 (likely RD New / EPSG:28992).
- [ ] If CSV: add a `downloadCSV(url)` helper (or reuse the ZIP downloader if the CSV is also served zipped — check the actual URL response headers)
- [ ] `cities/barendrecht.js` with `parse()` mapping CSV columns → standard schema
- [ ] Field names unknown — must inspect a sample CSV row before writing the mapping
- [ ] Coordinate system in the CSV unknown — likely RD New (EPSG:28992), which requires reprojection to WGS84. Add `proj4` (already in `node_modules` as a transitive dep — check if it's directly importable) or use a lightweight RD→WGS84 formula

### API
- [ ] Add to `api/cities.json`: `{ "id": "barendrecht", "name": "Barendrecht", "center": [51.855, 4.535], "bbox": { "s": 51.82, "n": 51.90, "w": 4.47, "e": 4.61 } }`
- [ ] Place generated `bomen-barendrecht.db` in `api/`

---

## Albrandswaard / Rhoon

**Effort: Low** (once Barendrecht is done) — identical infrastructure to Barendrecht via BAR-organisatie.

### Fetcher

Same platform, same format, different URLs and field values. After Barendrecht is working:

- [ ] `cities/albrandswaard.js` — copy Barendrecht module, swap URL constants
- [ ] Verify field names match (likely identical schema across BAR-organisatie municipalities, but confirm by inspecting a sample)
- [ ] Register in `config.js`

### API
- [ ] Add to `api/cities.json`: `{ "id": "albrandswaard", "name": "Albrandswaard", "center": [51.858, 4.427], "bbox": { "s": 51.82, "n": 51.91, "w": 4.37, "e": 4.50 } }`
- [ ] Place generated `bomen-albrandswaard.db` in `api/`

---

## Amsterdam

**Effort: Low–Medium** — WFS 2.0.0 with GeoJSON output, fits the existing fetcher architecture directly. No API key required. No coordinate conversion needed.

**Confirmed via live API inspection:**
- Endpoint: `https://api.data.amsterdam.nl/v1/wfs/bomen/`
- Feature type: `app:stamgegevens`
- Total trees: **321,914**
- Auth: none ("openbare data")
- `SRSNAME=EPSG:4326` → returns WGS84 `[lon, lat]` GeoJSON directly
- `resultType=hits` → returns XML with `numberMatched="321914"` for the count query

### Field mapping

| Amsterdam field | Standard field | Notes |
|---|---|---|
| `id` | `id` | Integer in source, cast to string |
| geometry `[lon, lat]` | `lon`, `lat` | Standard GeoJSON order, WGS84 |
| `soortnaam` | `species` | Full Latin name, e.g. `"Tilia americana"` |
| `soortnaam_kort` | `genus` | Genus only, e.g. `"Tilia"` |
| `soortnaam_top` | `name_indigenous` | Format: `"Linde (Tilia)"` — strip trailing ` (Xxx)` |
| `jaar_van_aanleg` | `year_planted` | Integer year |
| `mutatie_datum` | `last_updated` | ISO timestamp |
| — | `neighbourhood` | `null` — only `gbd_buurt_id` (opaque ID) available, no name |
| — | `street` | `null` — not in feature properties |
| — | `trunk_diameter` | `null` — `stamdiameterklasse` is a class range string, not a number |
| — | `crown_spread` | `null` — not available |

### Fetcher — `cities/amsterdam.js`

```js
const WFS_URL = 'https://api.data.amsterdam.nl/v1/wfs/bomen/';
const LAYER   = 'app:stamgegevens';
```

**`pageParams`** — WFS 2.0.0, GeoJSON output, WGS84:
```
SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature
&TYPENAMES=app:stamgegevens
&OUTPUTFORMAT=geojson&SRSNAME=EPSG:4326
&COUNT=<n>&STARTINDEX=<i>
```

**`countParams`** — `resultType=hits` returns XML:
```
SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature
&TYPENAMES=app:stamgegevens&resultType=hits
```

**`parseCount`** — parse `numberMatched` from the XML with a regex (avoids importing `xml2js` for a single attribute):
```js
async parseCount(raw) {
    const m = raw.match(/numberMatched="(\d+)"/);
    return m ? parseInt(m[1], 10) : 0;
}
```

**`parse`** — standard GeoJSON path, same shape as Groningen:
```js
async parse(raw) {
    const geojson = JSON.parse(raw);
    const trees = geojson.features.map(f => sanitiseTree(toTree(f))).filter(Boolean);
    return { trees, rawCount: geojson.features.length };
}
```

**`toTree`** — field mapping:
```js
function toTree(feature) {
    const p = feature.properties;
    const [lon, lat] = feature.geometry.coordinates;
    return {
        id:              String(p.id),
        lat:             +parseFloat(lat).toFixed(7),
        lon:             +parseFloat(lon).toFixed(7),
        species:         p.soortnaam        || null,
        genus:           p.soortnaam_kort   || null,
        name_indigenous: extractIndigenous(p.soortnaam_top),
        year_planted:    p.jaar_van_aanleg  || null,
        last_updated:    p.mutatie_datum    || null,
        neighbourhood:   null,
        street:          null,
        trunk_diameter:  null,
        crown_spread:    null,
    };
}
```

**`extractIndigenous`** — strips the parenthetical genus from `soortnaam_top`:
```js
function extractIndigenous(s) {
    if (!s) return null;
    return s.replace(/\s*\([^)]+\)\s*$/, '').trim() || null;
}
```

**`sanitiseTree`** — standard species extraction via `extractSpeciesBinomial` / `extractSpeciesCultivar`, with `species` uppercased before passing:
```js
function sanitiseTree(tree) {
    if (!tree?.species) return null;
    const upper = tree.species.trim().toUpperCase();
    tree.species_binomial = extractSpeciesBinomial(upper);
    if (!tree.species_binomial) return null;
    tree.species_cultivar = extractSpeciesCultivar(upper);
    return tree;
}
```

### `config.js`

```js
import amsterdam from './cities/amsterdam.js';
export const CITIES = { rotterdam, groningen, amsterdam };
```

### API — `cities.json`

```json
{
  "id": "amsterdam",
  "name": "Amsterdam",
  "center": [52.3676, 4.9041],
  "bbox": { "s": 52.28, "n": 52.43, "w": 4.73, "e": 5.08 }
}
```

### Testing sequence

1. `node index.js --city amsterdam --count 10 -d` — dry run, confirm field mapping looks right
2. `node index.js --city amsterdam --count 500` — smoke test pagination and SQLite write
3. `node index.js --city amsterdam --all` — full fetch (~322 pages × 1,000 = 321,914 trees; expect several minutes)
4. Drop `bomen-amsterdam.db` in `api/`, hit `/api/health` to confirm tree count

---

## Leeuwarden

**Effort: Blocked** — no usable public full-dataset found.

The municipality has a bomenviewer showing all trees, backed by an ArcGIS service at `gem-lwd.maps.arcgis.com`, but the underlying FeatureServer does not appear to be publicly exposed. The only downloadable data is monumental/valuable trees only (~754 trees), which is too sparse to be useful in the app.

**Options:**
- Contact the municipality (bomendienst@leeuwarden.nl) to request the full dataset or a public FeatureServer URL
- Check the ArcGIS Hub at [portaal-gem-lwd.opendata.arcgis.com](https://portaal-gem-lwd.opendata.arcgis.com/) periodically — they may publish it
- Reverse-engineer the network requests made by the bomenviewer to find the tile/query endpoint (not recommended without explicit permission)

**Skip for now.**
