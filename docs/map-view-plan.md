# Map-view migration plan

Move from "one active city whose trees are shown" to "every tree in view, whichever source it comes from".
Fixes trees being hidden where city bounding boxes overlap (e.g. Rotterdam's Nieuwenoord lies inside
Barendrecht's bbox and currently shows no Rotterdam trees).

## Status

Implemented 2026-09-29 on branch `map-view`. Differences from the plan below:

- **Duplicate ids** (found while building): same id within 5 m is dropped as a duplicate; same id further
  apart is kept under a suffixed id (`1~2`); ids used by more than 10 rows in a source are placeholders
  (all of Dordrecht is `undefined`, a fetcher bug; Deventer has `Onbekend`) and those trees get generated ids.
- **Extra pyramids**: `tile_source` (exact "sources in view" and place label in cluster areas too) and
  `species_cell` up to zoom 11 (live species clustering at low zoom took 300–500 ms for common species).
- **Overview**: while the places overlay is on, it replaces the trees and clusters on the map; zooming
  in past zoom 11 turns it off. The place picker is the existing icon button, so "the source with the
  most trees in view" became its tooltip rather than a label.
- **Per-source `clusterDisableZoom`** is kept (the largest override among sources in view applies);
  the other per-city overrides are gone.
- **React Router** was removed; the hash position is managed with the History API directly.

## Decisions

| Topic | Decision |
|---|---|
| Model | Map view: all trees in view; "source" (city/institution) is per-tree metadata |
| Compatibility | Forward only — no support for old bookmarks, share links or localStorage |
| Species list & search | Species **in view** only |
| Database | One national `trees.db` + `meta.db`, built by a script from `open-data-fetcher/data/*.db` (the per-city dbs stay as build inputs) |
| Tree payload | Slimmest: `[id, lat, lon, speciesId]` grouped by source; species dictionary sent once via `/api/meta`; details fetched on click |
| Clusters vs trees | Decided per 256 px tile by the server: > 500 trees → clusters (64 px cells, precomputed), otherwise trees |
| URL / history | Position in URL, updated with `replaceState` on every move; `pushState` only on deliberate jumps (place picker, locate-me, opening a shared tree) |
| Overview | No separate overview mode: clusters at every zoom. Place markers (city/institution colours) shown only while the place picker is open |
| Backlog | "Nearest tree of species X" added to BACKLOG.md (builds on this plan) |

Measured basis (all fetcher dbs combined): 2.71M trees, 2,469 species. Max ~330 clusters per 1400×900
viewport at any zoom (3 KB gz). Dense tree view (8.7k trees): 80 KB gz slim vs 199 KB gz / 2.6 MB raw full.

## Target architecture

```
open-data-fetcher/data/<source>.db   (per-source, unchanged fetcher output)
open-data-fetcher/data/vernacular-*.db
open-data-fetcher/sources.json       (hand-edited source metadata, moved from api/cities.json)
        │
        ▼  npm run build-db   (node:sqlite, no new dependencies)
api/data/trees.db   trees + precomputed cluster/species pyramids
api/data/meta.db    sources, species dictionary (with vernacular names), build version
api/data/issues.db  user-written issues — never touched by the build
        │
        ▼  PHP API (bbox/tile queries only, no city param)
app: tile loader → server clusters + client markercluster → details on click
```

## Phase 1 — Build script and national databases

New `open-data-fetcher/tools/build-db.js` (npm script `build-db`), replaces the `copy-data` script.
Uses the built-in `node:sqlite` module (Node ≥ 22.13; bump `engines`). `sql.js` is unsuitable here: it
keeps the whole ~2.7M-row database in WASM memory.

**`meta.db`**
- `build(version TEXT, built_at TEXT)`: version = timestamp or content hash; clients drop caches when it changes.
- `sources(idx INTEGER PRIMARY KEY, id TEXT UNIQUE, name, type, center_lat, center_lon, s, n, w, e, tree_count, last_fetched, meta_json)`,
  from `sources.json` plus values computed from the data. Bbox without margin; it's only used to fit the map when a place is picked.
  Drop the fetch-tuning fields (`mapZoom`, `minFetchZoom`, `maxViewportDeg2`, `clusterDisableZoom`): they have no meaning in a mixed view.
- `species(id INTEGER PRIMARY KEY, key TEXT UNIQUE, binomial, nl, en, de, fr)`: `key` = `species_binomial`, or the raw `species`
  string when the binomial is NULL (156 such trees in Rotterdam alone; the client already uses this fallback). Vernacular
  names are resolved at build time from `vernacular-nl.db` (overrides) and `vernacular-base.db`, the same priority rules as
  `api/index.php` applies today. This replaces the `/vernacular-names` endpoint and the PHP merge.

**`trees.db`**
- `trees(source_idx INT, id TEXT, lat REAL, lon REAL, species_id INT, species TEXT, species_cultivar, name_vernacular_src,
  year_planted, neighbourhood, street, trunk_diameter, crown_spread)`, `PRIMARY KEY(source_idx, id)`.
  Indexes: `(lat, lon)` for tiles; `(species_id, lat, lon)` for the species filter and later "nearest".
- `cluster_cell(z, cx, cy, count, lat, lon)` WITHOUT ROWID, `PRIMARY KEY(z, cx, cy)`: 64 px web-mercator cells for
  z 5–17; lat/lon = mean position of the trees in the cell. About 250k rows (measured through z16).
- `tile_species(z, x, y, species_id, count)` WITHOUT ROWID, `PRIMARY KEY(z, x, y, species_id)`: 256 px tiles, z 5–17.
  About 720k rows through z16. Used for the species-in-view list and for the per-tile mode decision under a species filter.

**Build steps:** read `sources.json` → attach each source db → insert trees (map species → id) → compute the pyramids
(one pass over the trees per zoom level, grouped in SQL on the computed cell indices, or in JS) → `ANALYZE` → `VACUUM` →
write `build.version`. Write to `*.tmp` files and rename at the end, so a failed build never leaves half a database.

**Checks:** tree count = sum of the inputs; report duplicate `(source, id)` rows; report sources in `sources.json` without a
db and vice versa; print the file sizes and build time.

## Phase 2 — API v2 (alongside the old endpoints)

All new endpoints read `trees.db`/`meta.db`. Enable gzip (`ob_start('ob_gzhandler')` unless the host already compresses —
check the production response headers).

| Endpoint | Purpose | Response |
|---|---|---|
| `GET /api/meta` | Once per session; ETag = build version | `{version, sources:[…], species:[[id, key, binomial, {nl,en,de,fr}]]}`, about 50 KB gz |
| `POST /api/tiles` `{z, tiles:[[x,y]…], species?}` | Main map call; the client only sends tiles missing from its cache | `{version, tiles:[{x, y, mode:'clusters', clusters:[[lat,lon,count]]} \| {x, y, mode:'trees', trees:{<sourceId>:[[id,lat,lon,speciesId]]}}]}` |
| `GET /api/species?z&x0&x1&y0&y1` | Species in view; only fetched while the list or search is open | `[[speciesId, count]]`, ≤ 12 KB gz at national zoom |
| `GET /api/tree?source&id` | Details on click | full tree object |
| `POST /api/trees/details` `{trees:[[source,id]…]}` (max 200) | Street/year for list rows (expanded species, same-point list) | array of detail objects |
| `/flag`, `/issues`, `/issues/resolve`, `/health` | Unchanged (the `city` column in `issues.db` keeps its name, meaning "source") | — |

**Mode rule per tile:** `count = SUM(cluster_cell.count)` over the tile's 4×4 cells (or `tile_species.count` for the chosen
species). If `count > 500` and `z ≤ 17` → clusters, otherwise trees (`SELECT … WHERE lat/lon in tile`).

**Species-filtered clusters:** compute live from the `(species_id, lat, lon)` index, bucketing into cells in PHP. Measure the
most common species at z 7–10. Only if that is too slow, add a precomputed `species_cluster_cell` for low zooms.

**Performance targets on the dev machine** (script with curl or node): `/api/tiles` for a full 1400×900 viewport in < 150 ms
at z 7, 10, 13, 16 (Rotterdam and Amsterdam centres); `/api/species` in < 100 ms at z 7.

## Phase 3 — Client: map and data layer

Do the work on a feature branch; the app is only consistent again once phases 3 and 4 are both done.

- **Types:** `SlimTree {source, id, lat, lon, speciesId}`, `TreeDetails` (the current `Tree` fields), `Source`, `SpeciesEntry`.
  Names are resolved via `speciesId` + locale from the meta dictionary (a helper/selector); `applyVernacularNames`
  and the remapping in `setLocale` go away.
- **Tile cache** (`tileCache.ts` rewrite): key `version:filter:z:x:y` → tile payload; LRU. If a tile is in trees mode, its
  children at higher zooms are derived on the client with no request, so zooming in within tree areas is free.
- **Tile loader** (replaces `useTreeLoader`): on `moveend` (debounced), take the 256 px tiles in view at the current integer zoom,
  POST the missing ones, abort the previous request. There is no longer a zoom gate or viewport-area gate.
- **MapController:** a server-cluster layer (bubbles styled the same as markercluster icons; click → `fitBounds` of the cell)
  plus the tree-mode trees in the existing markercluster group with one global `CLUSTER_DISABLE_ZOOM`. City markers are
  replaced by the place-marker overlay (phase 4).
- **URL:** hash route `#/@lat,lon,z`, optionally `?tree=<source>:<id>`. On `moveend`, `history.replaceState` directly (no
  React Router navigation, so no re-render); `navigate()` with push only for deliberate jumps. On start: URL position if
  present, otherwise the NL overview (`NL_CENTER`/`NL_ZOOM`).
- **Tree detail on click:** open the panel at once with the species name (from the dictionary), show a loading state for the
  detail fields, fetch `/api/tree`. Flag, favourite and share use `tree.source`. Share URL = `#/@lat,lon,19?tree=source:id`.
- **Remove:** `useCitySwitcher`, `cityLookup`, `cityMapSettings`, `positionStorage`, the overview/`autoSwitch` routing in
  `App.tsx`/`useMap.ts`, the "too zoomed out" banner, and the config constants `MIN_FETCH_ZOOM`, `MAX_VIEWPORT_DEG2`,
  `MIN_CITY_SWITCH_ZOOM`, `CITY_OVERVIEW_ZOOM`, `RESTORE_CITY_POSITION`, `CELL_SIZE_DEG`, `API_LIMIT`, `MAP_ZOOM`.

## Phase 4 — Client: panels and features

- **Species list panel:** counts from `/api/species` for the tiles in view (tiles at z+1 for a tighter fit). Expanding a
  species lists its trees from the tree-mode tiles; rows show the name immediately and street/year once the batch
  details call returns. In cluster areas, show "zoom in to see individual trees" plus the filter button.
- **Search:** filters the same species-in-view list client-side (no extra call). Selecting a species sets the species filter.
- **Species filter:** tiles requested with `species` (own cache namespace); the map stays where it is (no `fitTrees` —
  "take me to the nearest" is the backlog item). The badge and clearing work as today.
- **Same-point list:** batch details for street/year/cultivar.
- **Favourites:** flat map keyed `source:id` → snapshot `{source, id, lat, lon, speciesId, street, year_planted}`, taken from
  the details (you favourite from the detail panel, so they are loaded). Panel grouped by source name. New localStorage
  key; the old key is ignored.
- **Places picker** (CityButton): opening it shows the place markers overlay (city/institution colours) on the map and the
  list (recent + all). Picking one → `fitBounds(source bbox)` with a pushed history entry → overlay closes.
  Button label: the source with the most trees in the loaded tiles in view, or a generic "Places" when there are none.
- **Sources panel** (replaces CityInfoPanel): sources present in the current view (from the tile responses) with tree count,
  source/licence, date fetched and description. This explains sparse areas, e.g. "monumental trees only".
- **Locate-me:** fly plus location marker (pushed history entry); no city navigation.
- **Issues panel:** keeps working with the `city` column as source id; navigating to an issue = fly to its lat/lon.

## Phase 5 — Cleanup, docs, deploy

- Remove the old endpoints (`/cities`, `/trees` GET/POST, old `/species`, `/vernacular-names`), `load_cities`, the
  `cities-cache.json` logic and the per-city/vernacular dbs from `api/data/`.
- `open-data-fetcher`: remove `copy-data`; update `add-city.js` to write to `sources.json`.
- **README:** rewrite the architecture, API, SQLite schema, deployment and web-app sections (map view, tiles, meta,
  history behaviour). **BACKLOG:** mark the server-side clustering item done; note that the per-city zoom overrides are gone.
- **Deploy:** upload `trees.db`/`meta.db` under temporary names and rename them on the server (PHP never sees a
  half-uploaded file); `issues.db` stays untouched.

## Verification checklist

- Nieuwenoord (Rotterdam) and the adjacent Barendrecht streets both show trees in one view.
- Trompenburg's trees and the Rotterdam trees around it are visible together.
- National zoom shows clusters; Leeuwarden/Bergen outliers appear as individual trees without per-city settings.
- Back button: panning adds no entries; after picking a place, back returns to the previous view.
- Reload keeps the position; a shared tree link opens the tree's detail panel.
- Changing the locale updates names everywhere without refetching.
- Payload spot checks with DevTools: a dense tree view is about 80 KB gz; a cluster view is a few KB.

## Risks and open points

- `trees.db` size (upload time to shared hosting): measure in phase 1. Normalised species should keep it below today's
  combined ~700 MB.
- Species-filtered clusters at low zoom for very common species: measure in phase 2 (fallback described above).
- Datasets that overlap in content (an arboretum inside a municipal dataset) can show the same physical tree twice. Accepted;
  it's rare, and each marker is correct for its source.
- `node:sqlite` prints an "experimental" warning on Node 22; harmless.
