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

**Status:** Live, ready-to-use JSON — 23,391 trees, via `openbomenkaart.org` (supersedes the BAR-organisatie path below)

The originally-documented BAR-organisatie URLs (`maps.bar-organisatie.nl`) are unreachable from this dev sandbox — DNS resolves but every TCP connection to port 443 times out (distinct from the TLS-revocation issue logged elsewhere for other hosts), and the user flagged the domain itself as suspect. Re-investigating turned up a much better source already in use for `cities/voorschoten.js`: **openbomenkaart.org**, a community OSM-style tree-data mirror, hosts a ready-made per-municipality JSON export and **already has Barendrecht** (confirmed live, `200 OK`, WGS84 coordinates, no reprojection needed).

| Resource | URL |
|----------|-----|
| JSON export | https://openbomenkaart.org/data/trees_barendrecht.json |

**Verified structure** (same OSM-`elements`-with-`tags` shape as `voorschoten.js`):
```json
{ "type": "node", "id": 0, "lat": 51.850687, "lon": 4.5436834,
  "tags": { "natural": "tree", "reference": "??", "species": "Alnus glutinosa",
            "diameter": "0.10", "height": "15", "plantjaar": "1975", "ownership": "gemeente" } }
```
- `diameter` is already in **metres** (matches the schema directly, no unit conversion).
- **`id` is always `0` and `reference` is always `"??"`** — neither is usable as a unique tree id, unlike Voorschoten's `admin_ref`. A Barendrecht fetcher needs a synthetic id (e.g. array index) instead of reusing `voorschoten.js`'s `element.id || t.admin_ref` fallback verbatim.
- No `place`/street tag present on any element — `street` would be `null` for all Barendrecht trees.
- `plantjaar` → `year_planted` (note: different tag key than Voorschoten's `planted`).

**Old (superseded) BAR-organisatie research**, kept for reference in case `openbomenkaart.org` ever drops coverage:

| Format | URL |
|--------|-----|
| Shapefile (ZIP) | https://maps.bar-organisatie.nl/Online/Open%20Data%20Portaal/Barendrecht/Bomen/Bomen_barendrecht.zip |
| CSV | https://maps.bar-organisatie.nl/Online/Open%20Data%20Portaal/Barendrecht/Bomen/Bomen.CSV |
| WMS (view only) | https://maps.bar-organisatie.nl/arcgis/services/OpenDataPortaal/Bomen_BD/MapServer/WMSServer |

- **License:** CC-0 · **Data portal:** https://data.overheid.nl/en/dataset/5539-bomen-barendrecht · **Contact:** open-data@bar-organisatie.nl

---

## Albrandswaard / Rhoon

**Status:** Live, ready-to-use JSON — 13,591 trees, via `openbomenkaart.org` (supersedes the BAR-organisatie path below)

Same discovery as Barendrecht above — `openbomenkaart.org` already has Albrandswaard, and its data is actually **cleaner** than Barendrecht's: every element has a populated `admin_ref` (usable as a real unique id) and a `place` tag (usable as `street`).

| Resource | URL |
|----------|-----|
| JSON export | https://openbomenkaart.org/data/trees_albrandswaard.json |

**Verified tag schema:** `natural, context, admin_ref, species, diameter, height, place, planted, ownership` — all 13,591 elements have both `admin_ref` and `place` populated (checked via a full scan, not a sample). `diameter` is metres, `planted` is the year tag (matches Voorschoten's tag name, unlike Barendrecht's `plantjaar`).

**Old (superseded) BAR-organisatie research:**

| Format | URL |
|--------|-----|
| Shapefile (ZIP) | https://maps.bar-organisatie.nl/Online/Open%20Data%20Portaal/Albrandswaard/Bomen/Bomen_Albrandswaard.zip |
| CSV | https://maps.bar-organisatie.nl/Online/Open%20Data%20Portaal/Albrandswaard/Bomen/BOMEN.csv |
| WMS (view only) | https://maps.bar-organisatie.nl/arcgis/services/OpenDataPortaal/Bomen_AW/MapServer/WMSServer |

- **License:** CC-0 · **Data portal:** https://data.overheid.nl/dataset/5903-bomen-albrandswaard · **Contact:** open-data@bar-organisatie.nl

---

## Apeldoorn

**Status:** Full open dataset (76,230 trees) — Shapefile + CSV, no live query API for the complete set

The municipal open-data portal ("Bomen in de openbare ruimte", placed 2021-06-05, updated weekly) offers two downloads. The CSV has **no coordinates at all** — it's attributes only. The Shapefile has the geometry and is the only way to get the full, complete dataset with coordinates.

| Resource | URL |
|----------|-----|
| Portal page | https://www.apeldoorn.nl/dataportaal/dataportaal-product?pid=75 |
| Shapefile (ZIP, ~5.6 MB) | https://dataportaal.apeldoorn.nl/Data/Openbare_ruimte_en_Verkeer/BOR/shape/bomen_openbare_ruimte.zip |
| CSV — no geometry (~16 MB) | https://dataportaal.apeldoorn.nl/Data/Openbare_ruimte_en_Verkeer/BOR/csv/bomen_openbare_ruimte.csv |
| Contact | opendata@apeldoorn.nl |

**Verified by downloading and parsing both files directly:**
- Shapefile contains 76,230 point records (`.shp`/`.dbf`/`.shx`/`.prj`/`.cpg`); CSV has 76,230 data rows — same dataset, attributes match 1:1 by row order.
- `.prj` confirms **RD New / EPSG:28992** — needs reprojection. `proj4` (already present as a transitive `node_modules` dependency, directly `import`-able) reprojects correctly — spot-checked 3 sample points, all land inside Apeldoorn's bounds.
- A separate ArcGIS MapServer layer exists at `gis.apeldoorn.nl/arcgis/rest/services/GROENOBJECTEN_BOOM_bestek/MapServer/0` that supports live query with `outSR=4326` (no reprojection needed) — but it only has **21,951** features, a maintenance-contract subset, not the full municipal inventory. **Not a substitute** for the Shapefile.
- No ZIP-handling library is present in `node_modules` and the npm registry is unreachable from this sandbox (same TLS chain issue as other external hosts here), so adding a dependency couldn't be verified live. The ZIP is small, single-disk, and unencrypted — a ~30-line hand-rolled local-file-header parser using Node's built-in `zlib.inflateRawSync` is feasible and matches this project's existing no-dependency-shopping style (`lib/http.js` already hand-rolls HTTP rather than pulling in a client library).

**Field mapping (DBF column → schema):**

| DBF field (10-char truncated) | Schema field | Notes |
|---|---|---|
| `object_gui` | `id` | Full GUID string, e.g. `F639E486091473C6E0400A0A57324359` |
| `boomsoort` | `species` | Latin name incl. cultivar, e.g. `Prunus serrulata 'Kanzan'` — run through `processSpecies()` like `oss.js` |
| `diameter` | `trunk_diameter` | String range, e.g. `"60 - 70 cm"` → midpoint, same parser pattern as Den Haag's `STAMDIAMETERKLASSE` |
| `aanlegjaar` | `year_planted` | Numeric, sparse (blank for many rows in the sample) |
| `buurt` / `wijk` | `neighbourhood` | Fall back `wijk` when `buurt` empty, same pattern as `oss.js` |
| `straat` | `street` | Street name |
| geometry (SHP) | `lat`/`lon` | RD New → WGS84 via `proj4` |
| `boomtype`, `standplaat`, `boomhoogte`, `vergunning`, `bijzondere`, `eigenaar`, `groeiplaat`, `beheerder`, `status`, `woonplaats` | — | No matching schema field; not currently captured by any city fetcher |
| — | `crown_spread`, `last_updated` | Not available |

---

## Enschede

**Status:** Live ArcGIS MapServer — 83,375 trees ("bomenbeheersysteem met NL naam")

Found via ArcGIS map viewer at `enschede.maps.arcgis.com`. The layer is on the city's own geo-portal. A separate "Beschermwaardige bomen" layer (protected trees only, small subset) also exists but is blocked.

| Resource | URL |
|----------|-----|
| MapServer layer 0 | https://geoportaal.enschede.nl/arcgis/rest/services/OpenbareRuimte_Bomen/MapServer/0 |
| Query endpoint | …/MapServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=json |

**Field mapping (source → schema):**

| Source field | Schema field | Notes |
|---|---|---|
| `OBJECTID` | `id` | Auto-generated OID |
| `LATBOOMSOORT` | `species` | Full Latin name incl. cultivar |
| `NEDERLANDS` | `name_vernacular` | Dutch common name |
| geometry `x`/`y` | `lon`/`lat` | RD New (EPSG:28992) source; `outSR=4326` reprojects server-side |
| — | `year_planted`, `street`, `neighbourhood`, `trunk_diameter`, `crown_spread` | Not available in this layer |

- **`maxRecordCount`: 100,000** — all 83,375 trees fit in a single page
- **SSL:** City server; `rejectUnauthorized: false` as precaution
- **License:** Public layer (`allowOthersToQuery: true`)
- **WAF risk:** An earlier query attempt to `geoportaal.enschede.nl` returned an ArcGIS "The request is blocked" WAF page (see `enschede_opendata.html`). The layer metadata fetches fine, so the block may be request-type or user-agent specific. If the fetcher gets a non-JSON response or an ArcGIS error, try adding a browser `User-Agent` to `fetchOptions` in `enschede.js`.
- **Fetcher:** `cities/enschede.js` ✅ implemented

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

## Maastricht

**Status:** Live GeoServer WFS — 114,562 trees

The public-facing kaartviewer at `kaartviewer.maastricht.nl` is a JavaScript SPA; the WFS endpoint was found by probing the standard GeoServer path on the same host (`/geoserver/maastricht/ows`). The WMS URL visible in the kaartviewer's map requests (`…/bookmark/25/bookmarkpresentation/725/map`) uses layer name `maastricht:Bomen` — the same name works on the bare GeoServer WFS.

Two tree layers exist in the capabilities document:
- `maastricht:Bomen` — **114,562 trees**, full attribute set; the one to use
- `maastricht:BomenObsurvJan2024` — 58,732 trees, only `ID` + `BOOMSORTIM` + geometry (limited observation snapshot)

| Resource | URL |
|----------|-----|
| WFS (GeoServer) | https://kaartviewer.maastricht.nl/geoserver/maastricht/ows |
| WFS capabilities | …/ows?SERVICE=WFS&VERSION=1.0.0&REQUEST=GetCapabilities |
| KaartViewer | https://kaartviewer.maastricht.nl/?@Cultuurwaardekaart |

**Field mapping (source → schema):**

| Source field | Schema field | Notes |
|---|---|---|
| `ID` | `id` | Integer tree id |
| `AANLEGJAAR` | `year_planted` | Integer year; filter values ≤ 1800 (bogus placeholders, e.g. `1`) |
| `BOOMSORTIM` | `species` | Full Latin name incl. cultivar, e.g. `Prunus serrulata 'Kanzan'` |
| `DIAMETER` | `trunk_diameter` | Integer cm → divide by 100 for metres; nullable |
| `STRAAT` | `street` | Source uses `"dummy_groen1"` … `"dummy_groen6"` as placeholders → null |
| geometry | `lat` / `lon` | Request `srsName=EPSG:4326`; GeoServer reprojects from native EPSG:28992 server-side |
| — | `neighbourhood`, `crown_spread`, `name_vernacular` | Not available |

**Notable data quality issues:**
- Source contains duplicate rows — some trees appear twice with identical ID and coordinates.
- `STRAAT` is populated with `dummy_groenN` placeholders for a large fraction of trees.
- `AANLEGJAAR = 1` is a common bogus value for unknown planting year.

- **Pagination:** WFS 1.0.0, `sortBy=ID` required for GeoServer to honour `startIndex`
- **SSL:** `rejectUnauthorized: false` (municipal GeoServer)
- **Fetcher:** `cities/maastricht.js` ✅ implemented

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

## Steenwijk (Steenwijkerland)

**Status:** Live GeoServer WFS 2.0.0 — 36,247 trees

Discovered via the Neuron Smart Maps viewer at `infoopkaart.steenwijkerland.nl`. The viewer uses Socket.IO for interactive features, but the underlying geo-data is served by a standard GeoServer instance on the same host (`/geoserver/ows`). The `nsm:gd_boom` WFS layer covers all municipal trees in WGS84, no reprojection needed.

| Resource | URL |
|----------|-----|
| WFS endpoint | https://infoopkaart.steenwijkerland.nl/geoserver/ows |
| GetCapabilities | …/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities |
| Layer | `nsm:gd_boom` |
| Viewer | https://infoopkaart.steenwijkerland.nl/ |
| Municipality page | https://www.steenwijkerland.nl/Inwoners/Leefomgeving/Wegen_en_groen/Boombeheer |

**Field mapping (source → schema):**

| Source field | Schema field | Notes |
|---|---|---|
| `id` | `id` | Municipality tree ID |
| `latboomsoort` | `species` | Full Latin name incl. cultivar |
| `aanlegjaar` | `year_planted` | Integer year; filter ≤ 1800 |
| `woonplaats` | `neighbourhood` | Place name within municipality (e.g. "Steenwijk", "Blokzijl") |
| `openbare_ruimte` | `street` | Format "StreetName - PlaceName"; strip ` - {place}` suffix via `lastIndexOf` |
| geometry `coordinates` | `lon`/`lat` | WGS84 GeoJSON Point [lon, lat] via `SRSNAME=EPSG:4326` |
| — | `trunk_diameter`, `crown_spread`, `name_vernacular` | Not available |

Other fields present but not mapped: `structuurelement`, `boomtype`, `standplaats`, `inspectiedatum`, `boomconditie`, `risicoklasse`, `inspectiefrequentie`, `memo_kroon`, `memo_stam`, `memo_advies`, `kl_groenobject`.

- **SSL:** `rejectUnauthorized: false` (municipal GeoServer)
- **Pagination:** WFS 2.0.0 `COUNT`/`STARTINDEX`/`SORTBY=id`; count via `resultType=hits` → XML `numberMatched`
- **Fetcher:** `cities/steenwijk.js` ✅ implemented
- **Registered:** `config.js` ✅
- **API entry:** `api/cities.json` ✅ (`center: [52.7868, 6.1147]`)

---

## Hilversum

**Status:** Live GeoServer WFS 2.0.0 — 34,289 trees with species (45,959 total; ~11,670 have no species data)

Discovered via the ArcGIS Experience at `experience.arcgis.com/experience/0c13375082334f8ca5706e6bb2616fe5`, which references web map `61054382b93346cda647375af5c70372` on `hilversum.maps.arcgis.com`. The actual data is served by a public GeoServer at `geo.hilversum.nl/geoserver/ows`, layer `hilversum:GV_BOMEN`. WGS84 via `SRSNAME=EPSG:4326` — no reprojection needed.

The layer includes trees owned by adjacent municipality Wijdemeren as well as Hilversum's own inventory; Wijdemeren trees have null `SOORTNAAM`. A `CQL_FILTER=SOORTNAAM IS NOT NULL` is applied in both page and count queries to skip those ~11,670 null-species records.

`JAARVANAANLEG` can be null, `"N.v.t."`, or a year string — values ≤ 1800 are treated as null.

| Resource | URL |
|----------|-----|
| WFS endpoint | https://geo.hilversum.nl/geoserver/ows |
| Layer | `hilversum:GV_BOMEN` |
| ArcGIS Experience | https://experience.arcgis.com/experience/0c13375082334f8ca5706e6bb2616fe5 |

**Field mapping (source → schema):**

| Source field | Schema field | Notes |
|---|---|---|
| `OBJECTNUMMER` | `id` | String ID |
| `SOORTNAAM` | `species` | Full Latin name incl. cultivar |
| `SOORTNAAM_NED` | `name_vernacular` | Dutch common name |
| `JAARVANAANLEG` | `year_planted` | String; `"N.v.t."` and null treated as null |
| `BUURT` (fallback `WIJK`) | `neighbourhood` | Neighbourhood; fall back to district |
| `OPENBARERUIMTE` | `street` | Street name |
| `STAMDIAMETERKLASSE` | `trunk_diameter` | Dutch decimal string like `"0,2 tot 0,3 m."` → midpoint in metres |
| geometry `coordinates` | `lon`/`lat` | WGS84 GeoJSON Point [lon, lat] |
| — | `crown_spread` | Not available |

- **SSL:** `rejectUnauthorized: false` (municipal GeoServer)
- **Pagination:** WFS 2.0.0 `COUNT`/`STARTINDEX`/`SORTBY=OBJECTNUMMER`; count via `resultType=hits`
- **Fetcher:** `cities/hilversum.js` ✅ implemented
- **Registered:** `config.js` ✅
- **API entry:** `api/cities.json` ✅ (`center: [52.2292, 5.1669]`)

---

## Summary

| City | Full dataset | Format | Live API/WFS | License |
|------|-------------|--------|--------------|---------|
| Den Haag | Yes | GeoJSON ZIP, CSV ZIP, Shapefile | No (nightly static) | CC-0 |
| Barendrecht | Yes (23,391 trees) | JSON (openbomenkaart.org) | No (static) | — |
| Albrandswaard | Yes (13,591 trees) | JSON (openbomenkaart.org) | No (static) | — |
| Apeldoorn | Yes (76,230 trees) | Shapefile (geometry), CSV (no geometry) | No (weekly static) | — |
| Amsterdam | Yes | REST API / WFS | Yes | Open (API key needed) |
| Dordrecht | Yes | JSON (openbomenkaart.org) | No (static) | — |
| Maastricht | Yes (114,562 trees) | WFS GeoJSON (GeoServer) | Yes | — |
| Gouda | Yes (24,736 trees, all municipal) | WFS 2.0.0 GeoJSON (GeoServer) | Yes | Open |
| Gorinchem | Yes (18,180 trees) | WFS 2.0.0 GeoJSON (GeoServer) | Yes | Open |
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

## Barendrecht ✅

**Effort: Low** — `openbomenkaart.org` already has it; same `singleFetch` shape as `cities/voorschoten.js`, no ZIP/reprojection needed.

The BAR-organisatie path turned out to be a dead end (host unreachable from this sandbox, and the user flagged the domain as likely wrong). Re-investigation found Barendrecht is already published on `openbomenkaart.org` — the same source `cities/voorschoten.js` already pulls from — in the identical OSM-`elements` JSON shape, already in WGS84, already in metres for diameter.

### Fetcher

- [x] `cities/barendrecht.js`, modeled on `cities/voorschoten.js`:
  - `wfsUrl: 'https://openbomenkaart.org/data/trees_barendrecht.json'`, `singleFetch: true`, `fetchOptions: { rejectUnauthorized: false }`
  - **Do not** reuse `element.id || t.admin_ref` for `id` — every element's `id` is `0` and `reference` is always `"??"` in this dataset (confirmed via a full scan of all 23,391 elements, not just a sample). Use the array index instead, e.g. `id: String(index)`.
  - `t.plantjaar` → `year_planted` (not `t.planted` — different tag key than Voorschoten)
  - `street: null` always — no `place` tag exists anywhere in this dataset
  - `diameter` parsing: same as Voorschoten (`parseFloat`, strip `~`/`,`), already in metres
- [x] Registered in `config.js`

### API
- [x] Entry added to `api/cities.json`: center [51.855, 4.535]
- [ ] Place generated `barendrecht.db` in `api/data/`

---

## Albrandswaard / Rhoon ✅

**Effort: Low** — same `openbomenkaart.org` source, and the data is cleaner than Barendrecht's (real ids, real street names).

### Fetcher

- [x] `cities/albrandswaard.js`, modeled on `cities/voorschoten.js`:
  - `wfsUrl: 'https://openbomenkaart.org/data/trees_albrandswaard.json'`, `singleFetch: true`
  - `t.admin_ref` is populated for all 13,591 elements (confirmed via full scan) — safe to use as `id`, same pattern as Voorschoten
  - `t.place` is populated for all elements — maps to `street`
  - `t.planted` is the year tag here (matches Voorschoten's tag name, unlike Barendrecht's `plantjaar`)
- [x] Registered in `config.js`

### API
- [x] Entry added to `api/cities.json`: center [51.858, 4.427]
- [ ] Place generated `albrandswaard.db` in `api/data/`

---

## Apeldoorn

**Effort: Medium** — `index.js` already has a `singleFetch: true` mode (used by `cities/voorschoten.js`) that downloads once, caches in memory, and slices per page — so the pagination/caching half of this problem is already solved. The genuinely novel pieces are a ZIP/Shapefile reader and an RD New → WGS84 reprojection step, since unlike Voorschoten/Barendrecht/Albrandswaard, Apeldoorn's data isn't on `openbomenkaart.org` (checked — `404`) and the only full-dataset source is a Shapefile, not ready-made JSON.

### Fetcher

- [ ] `lib/shapefile.js` (or inline in `cities/apeldoorn.js`) — minimal `.shp`/`.dbf` reader:
  - `.dbf`: standard dBase III header (record count at offset 4, header size at offset 8, field descriptors from offset 32 until `0x0D` terminator) — straightforward fixed-format binary parse, verified against the live file (76,230 records, 17 fields).
  - `.shp`: standard ESRI shapefile, point type only needed here (shape type `1`) — header skip 100 bytes, then per-record `[recNum(4 BE), contentLen(4 BE), shapeType(4 LE), x(8 LE double), y(8 LE double)]`. Verified record-for-record alignment with the `.dbf` (same count, same order).
  - No `shapefile` npm package needed — confirmed no zip/shapefile library already in `node_modules`, and npm registry is unreachable from this sandbox to add one live.
- [ ] ZIP extraction — hand-rolled local-file-header parser (signature `0x04034b50`) + `zlib.inflateRawSync` for the `deflate`-compressed entries (Node built-in, no new dependency). The ZIP is small and single-disk so this is tractable.
- [ ] RD New → WGS84 reprojection via `proj4` — already resolves from `open-data-fetcher` (transitive dependency), confirmed working:
  ```js
  proj4.defs('EPSG:28992', '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 ' +
    '+k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel ' +
    '+towgs84=565.4171,50.3319,465.5524,-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs');
  const [lon, lat] = proj4('EPSG:28992', 'EPSG:4326', [x, y]);
  ```
  Consider promoting `proj4` from transitive to a direct `package.json` dependency since the fetcher would now import it explicitly.
- [ ] `cities/apeldoorn.js` — `wfsUrl` is the ZIP URL, `singleFetch: true` (same as `voorschoten.js`); `parse(raw)` does ZIP-extract → SHP/DBF-parse → reproject → map to schema, returning `{ trees: all }` in one call. No `pageParams`/`countParams`/`parseCount` needed — `index.js`'s `singleFetch` branch calls `parse()` exactly once and slices the result itself. One wrinkle Voorschoten's plain-JSON case doesn't have: `fetchRaw` decodes the response with `encoding: 'utf8'` by default, which would corrupt the binary ZIP — pass `fetchOptions: { encoding: 'binary' }` (or read the bytes as `latin1` and convert back with `Buffer.from(raw, 'latin1')`) so the ZIP bytes survive the round trip through `fetchRaw`'s string-based interface.
- [ ] Field mapping per the table above — `diameter` midpoint parsing reuses the Den Haag pattern; `species` goes through `processSpecies()` like `oss.js`.
- [ ] Register in `config.js`

### API
- [ ] Add to `api/cities.json`: `{ "id": "apeldoorn", "name": "Apeldoorn", "center": [52.2112, 5.9699], "bbox": { "s": 52.10, "n": 52.30, "w": 5.80, "e": 6.20 } }`
- [ ] Place generated `bomen-apeldoorn.db` in `api/`

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

## Leiden

**Status:** Live, via `openbomenkaart.org` — `trees_leiden.json` confirmed present and large (>10 MB, 2026-06-17).

Previously documented as blocked (park-level only). Re-checked 2026-06-17: `openbomenkaart.org/data/trees_leiden.json` now returns a full city-wide dataset. Tag structure follows OBK conventions; `planted`/`plantjaar` fallback and `admin_ref`/index id fallback applied in the fetcher since the file is too large to inspect via WebFetch.

| Resource | URL |
|----------|-----|
| OBK viewer | https://openbomenkaart.org/obk.htm?data=leiden |
| JSON export | https://openbomenkaart.org/data/trees_leiden.json |

**Field mapping:**

| OBK tag | Schema field | Notes |
|---|---|---|
| `element.id` (or `admin_ref`) | `id` | OSM node id if >0, else `admin_ref`, else array index |
| `element.lat` / `element.lon` | `lat` / `lon` | WGS84, no reprojection needed |
| `species` | `species` | Latin name, run through `processSpecies()` |
| `planted` or `plantjaar` | `year_planted` | Both tag variants handled |
| `diameter` | `trunk_diameter` | Already in metres |
| `place` | `street` | May be absent |
| — | `neighbourhood`, `crown_spread`, `name_vernacular` | Not available |

- **Fetcher:** `cities/leiden.js` ✅ implemented
- **Registered:** `config.js` ✅
- **API entry:** `api/cities.json` ✅

---

## Dordrecht

**Status:** Live, via `openbomenkaart.org`.

An ArcGIS web map exists (`arcgis.com` item `1e0dab584ff64466a085ed58403c64ce`) and CKAN lists a "Straatbomen van Dordrecht" dataset, but the underlying data is a static 2016 CSV export — not a live queryable endpoint. `openbomenkaart.org` has a current full-city export that follows the same OBK OSM-element structure as Voorschoten and Leiden.

| Resource | URL |
|----------|-----|
| OBK viewer | https://openbomenkaart.org/obk.htm?data=dordrecht |
| JSON export | https://openbomenkaart.org/data/trees_dordrecht.json |
| CKAN (static CSV, 2016) | https://ckan.dataplatform.nl/dataset/bomen-dordrecht |

**Field mapping:**

| OBK tag | Schema field | Notes |
|---|---|---|
| `element.id` (or `t.admin_ref`) | `id` | OSM node id if present, else `admin_ref` |
| `element.lat` / `element.lon` | `lat` / `lon` | WGS84, no reprojection needed |
| `species` | `species` | Latin name, run through `processSpecies()` |
| `planted` | `year_planted` | Year tag |
| `diameter` | `trunk_diameter` | Already in metres |
| `place` | `street` | May be absent |
| — | `neighbourhood`, `crown_spread`, `name_vernacular` | Not available |

- **Fetcher:** `cities/dordrecht.js` ✅ implemented (modeled on `cities/voorschoten.js`)
- **Registered:** `config.js` ✅
- **API entry:** `api/cities.json` ✅ (`center: [51.8133, 4.6899]`)

---

## Den Bosch ('s-Hertogenbosch)

**Status:** Partial — ~1,907 monumental and valuable trees via ArcGIS MapServer. Full municipal inventory not publicly available.

The municipality manages its trees via a commercial BomenMonitor system (COBRA Groeninzicht) but has not published the full dataset. The data.overheid.nl open-data request for Den Bosch trees was marked "Afgehandeld" with the conclusion that no full dataset exists in the public domain. OpenBomenKaart has no Den Bosch coverage.

What IS accessible: the "Beschermde bomen" MapServer on geoproxy.s-hertogenbosch.nl, layer 10, which serves the protected and valuable trees registered under the tree ordinance (boomverordening).

| Resource | URL |
|----------|-----|
| MapServer layer 10 (Monumentale/Waardevolle bomen) | https://geoproxy.s-hertogenbosch.nl/ags_extern/rest/services/Externvrij/Beschermde_bomen/MapServer/10 |
| Query endpoint | …/MapServer/10/query?where=1%3D1&outFields=*&outSR=4326&f=json |
| GeoPortaal | https://geoportaal2-s-hertogenbosch.opendata.arcgis.com/datasets/boomstructuur |

**Field mapping (source → schema):**

| Source field | Schema field | Notes |
|---|---|---|
| `NIEUWNR` (fallback `OBJECTID`) | `id` | Tree registration number; nullable, falls back to OBJECTID |
| `BOOMSOORT_WETENSCHAPPELIJK` | `species` | Full scientific name |
| `LEEFTIJD` | `year_planted` | Age string → `fetchYear − parseInt(age)` |
| `STAMDIAMETER` | `trunk_diameter` | Numeric cm → metres (divide by 100); sparse |
| geometry `x`/`y` | `lon`/`lat` | WGS84 via `outSR=4326` |
| — | `neighbourhood`, `street`, `crown_spread`, `name_vernacular` | Not available |

- **SSL:** `rejectUnauthorized: false` (municipal server)
- **Fetcher:** `cities/den-bosch.js` ✅ implemented (ArcGIS REST, same pattern as `cities/den-haag.js`)

---

## Alkmaar

**Status:** Live WFS 2.0.0 GeoJSON via Alkmaar GeoServer — 56,065 trees

Found via `datalab.alkmaar.nl`. The GeoServer exposes multiple layers; `Alkmaar:Bomen` is the full municipal tree inventory, queryable with standard WFS 2.0.0 pagination. Returns WGS84 directly via `srsName=EPSG:4326`, no reprojection needed.

| Resource | URL |
|----------|-----|
| Open data portal | https://datalab.alkmaar.nl/opendata.html |
| WFS capabilities | https://datalab.alkmaar.nl/geoserver/Alkmaar/wfs?service=WFS&version=2.0.0&request=GetCapabilities |
| Layer | `Alkmaar:Bomen` |

**Field mapping (source → schema):**

| Source field | Schema field | Notes |
|---|---|---|
| `boomnr` | `id` | Tree registration number |
| `latnaam` | `species` | Full Latin name incl. cultivar, e.g. `Fraxinus excelsior 'Diversifolia'` |
| `nednaam` | `name_vernacular` | Dutch common name, e.g. `Gewone es CV.` |
| `plantjaar` | `year_planted` | Numeric year → string |
| `buurt` | `neighbourhood` | Neighbourhood name |
| geometry `coordinates` | `lon`/`lat` | WGS84 GeoJSON Point [lon, lat] |
| — | `street`, `trunk_diameter`, `crown_spread` | Not available in this layer |

- **SSL:** `rejectUnauthorized: false` as precaution
- **Pagination:** WFS 2.0.0 `COUNT`/`STARTINDEX`/`sortBy=boomnr`; count via `resultType=hits`
- **Fetcher:** `cities/alkmaar.js` ✅ implemented
- **Registered:** `config.js` ✅
- **API entry:** `api/cities.json` ✅ (`center: [52.6324, 4.7534]`)

---

## Lelystad

Lelystad — blocked: no accessible dataset with species data. PDOK BGT works (location-only, ~40k trees) but has zero tree attributes beyond coordinates. `ckan.dataplatform.nl` (municipal dataset) was unreachable. Revisit if municipality publishes a richer open dataset.

---

## Ede

**Status:** Live, via `openbomenkaart.org` — large dataset (>10 MB JSON); no public ArcGIS/WFS source found.

Checked `geo.ede.nl` (KaartViewer) and `gis.ede.nl/arcgis` — neither exposes a public tree service. `openbomenkaart.org/data/trees_ede.json` is confirmed live. Uses the standard OBK OSM-elements JSON shape. Both `planted`/`plantjaar` year-tag variants and `element.id`/`admin_ref`/index id fallbacks handled in the fetcher (file too large to inspect directly).

| Resource | URL |
|----------|-----|
| OBK viewer | https://openbomenkaart.org/obk.htm?data=ede |
| JSON export | https://openbomenkaart.org/data/trees_ede.json |

**Field mapping:**

| OBK tag | Schema field | Notes |
|---|---|---|
| `element.id` (or `admin_ref`, or array index) | `id` | OSM node id if >0, else `admin_ref`, else index |
| `element.lat` / `element.lon` | `lat` / `lon` | WGS84, no reprojection needed |
| `species` | `species` | Latin name, run through `processSpecies()` |
| `planted` or `plantjaar` | `year_planted` | Both tag variants handled |
| `diameter` | `trunk_diameter` | Already in metres |
| `place` | `street` | May be absent |
| — | `neighbourhood`, `crown_spread`, `name_vernacular` | Not available |

- **Fetcher:** `cities/ede.js` ✅ implemented
- **Registered:** `config.js` ✅
- **API entry:** `api/cities.json` ✅ (`center: [52.0407, 5.6616]`)

---

## Leeuwarden

**Status:** Partial — 878 monumental and valuable trees via ArcGIS FeatureServer. Full municipal inventory not publicly accessible.

The municipality's bomenviewer shows all trees but the underlying service is not publicly exposed. A separate FeatureServer (`lelan_monumentale_waardevolle_bomen_punt`) on services3.arcgis.com covers the trees registered under the tree ordinance (boomverordening). This supersedes the earlier CKAN dataplatform link which became unreachable.

| Resource | URL |
|----------|-----|
| FeatureServer layer 0 | https://services3.arcgis.com/fHFI5v2gmYsUxbYF/arcgis/rest/services/lelan_monumentale_waardevolle_bomen_punt/FeatureServer/0 |
| Query endpoint | …/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=json |

**Field mapping (source → schema):**

| Source field | Schema field | Notes |
|---|---|---|
| `OBJECT_GUI` (fallback `FID`) | `id` | GUID string from municipality system |
| `LATBOOMSOO` | `species` | Latin name (field name truncated by ArcGIS, values are full) |
| `NEDBOOMSOO` | `name_vernacular` | Dutch common name |
| `DIAMETER` | `trunk_diameter` | Numeric cm → metres (divide by 100) |
| `AANLEGJAAR` | `year_planted` | Actual planting year (SmallInteger, not age) |
| `BUURT` | `neighbourhood` | Neighbourhood; sparse |
| `OPENBARE_R` | `street` | Public road name; sparse |
| geometry `x`/`y` | `lon`/`lat` | WGS84 via `outSR=4326` |
| — | `crown_spread` | Not available |

- **SSL:** Public services3.arcgis.com — no certificate override needed
- **Fetcher:** `cities/leeuwarden.js` ✅ implemented (ArcGIS REST, same pattern as `cities/den-bosch.js`)

---

## Maastricht ✅

**Effort: Low** — GeoServer WFS, same pattern as Groningen; CRS handled server-side; no reprojection needed.

The WFS endpoint is not documented publicly but is accessible at the standard GeoServer path on the kaartviewer host. It was discovered by inspecting the WMS layer name (`maastricht:Bomen`) from the kaartviewer's map requests and probing `/geoserver/maastricht/ows`.

### Fetcher

- [x] `cities/maastricht.js` — WFS 1.0.0, `typeName=maastricht:Bomen`, `sortBy=ID`, GeoJSON output, `srsName=EPSG:4326`
- [x] `rejectUnauthorized: false` (municipal GeoServer)
- [x] `AANLEGJAAR` → `year_planted`, filtered: values ≤ 1800 become `null`
- [x] `BOOMSORTIM` → `species` → through `processSpecies()`
- [x] `DIAMETER` (integer cm) → `trunk_diameter` (metres, divide by 100); null when absent
- [x] `STRAAT` → `street`; values starting with `"dummy_groen"` → `null`
- [x] Registered in `config.js`

### API

- [x] Entry added to `api/cities.json`: center [50.8514, 5.6910]
- [ ] Place generated `maastricht.db` in `api/data/`

---

## Gouda

**Status:** Full municipal dataset — 24,736 trees via GeoServer WFS 2.0.0

The WMS URL initially found (`gis.gouda.nl/api/app/Basisviewer_open/…/proxy/wms`) is a viewer proxy that only exposes the monumental trees layer (`V_BOMEN_GRIB_MON`, 430 trees). The actual backend is a public GeoServer at `gis.gouda.nl/geoserver/Open/wfs` with 200+ layers. The full municipal tree layer `V_BOMEN_GRIB_GEM` ("Gemeentelijke bomen") has 24,736 trees and is openly queryable with no authentication.

The WMS proxy URL does not accept WFS requests (returns HTTP 400) — go directly to the GeoServer URL.

| Resource | URL |
|----------|-----|
| GeoServer WFS | https://gis.gouda.nl/geoserver/Open/wfs |
| GetCapabilities | …/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities |
| Full dataset layer | `Open:V_BOMEN_GRIB_GEM` (Gemeentelijke bomen, 24,736 trees) |
| Monumental only | `Open:V_BOMEN_GRIB_MON` (Monumentale bomen, 430 trees) — **not used** |
| WMS viewer proxy (WFS-only, do not use for data) | https://gis.gouda.nl/api/app/Basisviewer_open/layer/lyr%3A0GD4A664J2X89%3AV_BOMEN_GRIB_MON/proxy/wms |

**Field mapping (source → schema):**

| Source field | Schema field | Notes |
|---|---|---|
| `GRIB_ID` | `id` | Municipality tree ID |
| `SOORT` | `species` | Full scientific name incl. cultivar, e.g. `Fraxinus excelsior 'Diversifolia'` |
| `SOORT_NL` | `name_vernacular` | Dutch common name, e.g. `Gewone es CV.` |
| `STRAAT` | `street` | Street name |
| `BUURT` | `neighbourhood` | Neighbourhood (fallback: `WIJK`) |
| `DIAMETERKL` | `trunk_diameter` | Class string → midpoint in metres (e.g. `"30 tot 50 cm"` → 0.40 m, `"< 20 cm"` → 0.10 m) |
| geometry `coordinates` | `lon`/`lat` | WGS84 GeoJSON Point [lon, lat], returned directly via `SRSNAME=EPSG:4326` |
| — | `year_planted`, `crown_spread` | Not available in this dataset |

Other fields present but not mapped: `WIJK`, `EIGENAAR`, `BEHEERDER`, `AANWEZIGHEID`, `BELEIDSSTATUS`, `HOOGTEKLAS`, `BVC_WIJK`.

- **Pagination:** WFS 2.0.0 `COUNT`/`startIndex`/`sortBy=GRIB_ID`; count via `COUNT=1` + `totalFeatures` in response
- **SSL:** No certificate issues observed (public GeoServer)
- **Fetcher:** `cities/gouda.js` ✅ implemented
- **Registered:** `config.js` ✅
- **API entry:** `api/cities.json` ✅ (`center: [52.0116, 4.7106]`)

---

## Gorinchem

**Status:** Live GeoServer WFS 2.0.0 — 18,180 trees with full attribute set

Discovered via the geoportal bomenviewer at `geoportaal.gorinchem.nl/geoapps/bomen.html`. The viewer uses a GeoServer WMS for rendering; the same GeoServer exposes a WFS endpoint. Several tree layers exist in the capabilities document; `data:monumentale_beeldbepalende_bomen` is the one with the full inventory and rich attributes (scientific name, Dutch name, year, street, neighbourhood, diameter). The other layers (`monumentaleboomstructuren2`, `obsurv_bgt_bomen`) are either far sparser or contain no species data.

| Resource | URL |
|----------|-----|
| WFS endpoint | https://geoportaal.gorinchem.nl/geoserver/data/wfs |
| GetCapabilities | …/wfs?service=WFS&version=2.0.0&request=GetCapabilities |
| Layer | `data:monumentale_beeldbepalende_bomen` |
| Viewer | https://geoportaal.gorinchem.nl/geoapps/bomen.html |

**Field mapping (source → schema):**

| Source field | Schema field | Notes |
|---|---|---|
| `elementnummer` | `id` | Municipality tree ID |
| `wetensch_naam` | `species` | Full scientific name incl. cultivar, e.g. `Fraxinus excelsior 'Diversifolia'`, hybrids use lowercase `x` (`Platanus x hispanica`) |
| `boomsoort` | `name_vernacular` | Dutch common name, e.g. `zwarte els` |
| `aanlegjaar` | `year_planted` | Integer year → string |
| `straat` | `street` | Street name |
| `wijk` | `neighbourhood` | Neighbourhood/district |
| `diameter` | `trunk_diameter` | String integer in **cm** → divide by 100 for metres; often null |
| geometry `coordinates` | `lon`/`lat` | WGS84 GeoJSON Point [lon, lat] via `srsName=urn:ogc:def:crs:EPSG::4326`; default response is EPSG:28992 |
| — | `crown_spread` | Not available |

Other fields present but not mapped: `beheergroep`, `beheerobjectomschrijving`, `beheerder`, `ambitieniveau`, `eigenaar`, `filenaam`, `groengebiedcode`, `groengebiednaam`, `hoogte`, `type` (Beeldbepalend/Monumentaal), `snoeidatum`, `snoeijaar`.

- **SSL:** `rejectUnauthorized: false` (municipal GeoServer)
- **Pagination:** WFS 2.0.0 `COUNT`/`STARTINDEX`/`sortBy=elementnummer`; count via `resultType=hits` → XML `numberMatched`
- **Fetcher:** `cities/gorinchem.js` ✅ implemented
- **Registered:** `config.js` ✅
- **API entry:** `api/cities.json` ✅ (`center: [51.8350, 4.9756]`)
