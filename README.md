# Bomen

Interactive map of municipal and arboretum trees in the Netherlands. The map shows every tree in view, whichever dataset it comes from; data is loaded per map tile on demand, never a full dataset upfront.

**Cities:** Rotterdam · Groningen · Den Haag · Amsterdam · Utrecht · Arnhem · Nijmegen · Zwolle · Eindhoven · Amersfoort · Breda · Assen · Delft · Haarlem · Zandvoort · Oss · Voorschoten · Deventer · Apeldoorn · Enschede · Leiden · Dordrecht · Alkmaar · Den Bosch · Ede · Albrandswaard · Barendrecht · Leeuwarden · Roosendaal · Almere · Maastricht · Ridderkerk · Gouda · Wageningen · Steenwijk · Hilversum · Gorinchem · Zoetermeer · Bergen (NH) · Súdwest-Fryslân

**Institutions (arboretums):** Bomenmuseum Gimborn · Arboretum Trompenburg · Pinetum Ter Borgh · Pinetum de Dennenhorst · Arboretum De Nieuwe Ooster

---

## Features

- **Map view across all sources** — the map shows every tree in view regardless of which dataset (city or institution) it comes from, so trees near municipal borders or inside overlapping datasets are never hidden. The source is per-tree metadata.
- **Clusters at every zoom** — the server decides per 256 px map tile: more than 500 trees → precomputed clusters, otherwise individual trees. Zoomed out you see tree density across the country; zoomed in, individual trees. Sparse datasets (e.g. monumental-trees-only layers) show individual trees from far out without any per-city settings.
- **Species markers** — each tree is a circular SVG marker with a 4-char species code (`QuRo` for *Quercus robur*).
- **One set of bubbles** — server clusters join the tree markers in Leaflet.markercluster, carrying their tree count, so bubbles group by on-screen distance (120 px below zoom 16, 80 px from 16) instead of showing the server's 64 px grid, and cluster tiles and tree tiles blend seamlessly. Clustering stops at `CLUSTER_DISABLE_ZOOM`.
- **Species list panel** — species in view with counts, with a search box at the top (scientific and vernacular names; Enter filters on the top row). Expanding a species lists its individual trees (where the map shows individual trees); clicking highlights the tree on the map. Each row has two actions: filter the map on this species, and fly to the nearest tree of it.
- **Nearest tree** — finds the tree of a species closest to the map centre, across all sources. If it's in view, its detail panel opens right away. Otherwise the distance and place (source, street) appear under the species row, and only "Go there" flies to it (zoom 18, as a history entry so back returns) and opens its panel; a "Back to previous position" bar then shows for 8 seconds. While searching, matching species that aren't in view are listed under "Not in view" with only this action, so any species in the country can be found.
- **Species filter** — the map shows only one species (clusters and trees); the filter persists across map moves.
- **Tree detail panel** — species, vernacular name, year planted, street, trunk diameter, crown spread, Wikipedia/Google links and a photo thumbnail. Details are fetched when the tree is opened.
- **Tree photos** — species photos fetched on demand from the [iNaturalist API](https://api.inaturalist.org/v1/) using the binomial name. A thumbnail appears in the detail panel; tapping it opens a full-screen modal with a swipeable photo gallery and per-photo attribution. Photos with no licence (`all rights reserved`) are excluded; all others are shown with their iNaturalist attribution string. Images are hot-linked from iNaturalist's S3 CDN — no self-hosting required. Results are cached in-memory per species for the session lifetime.
- **Places** — the signpost button lists recently visited places and "All places": the national overview with a marker per dataset (green = city, amber = institution). Picking one flies to its extent.
- **Sources in view** — the info button lists the datasets the trees in view come from, with counts, source, date fetched and description.
- **Favourites** — save trees from any source; stored in `localStorage`.
- **Position in the URL** — `#@lat,lon,zoom`; reloading or sharing a URL keeps the view. Panning updates the current history entry, so the back button isn't flooded; deliberate jumps (picking a place, locate-me, flying to a favourite or issue) add one, so back returns to where you were.
- **Share a tree** — `#@lat,lon,19?tree=<source>:<id>` opens the tree's detail panel.
- **Settings menu** — gear-icon dropdown to switch UI language (Dutch, English, German, French; defaults to Dutch) and name mode (scientific ↔ vernacular); both persisted in `localStorage`.
- **Map layers** — streets (OSM), satellite (Esri), topographic (OpenTopoMap), light (CARTO).
- **Current location** — geolocation button flies to the user's position and places a location dot.

---

## Project layout

```
open-data-fetcher/   Node.js — pulls tree data from each source → per-source SQLite;
                     builds the national databases the API serves (tools/build-db.js)
api/                 PHP — serves tiles, species and tree details over HTTP from SQLite
app/                 Vite + React web app
```

---

## Running locally

**Prerequisites**
- Node.js ≥ 22.13 (the build script uses the built-in `node:sqlite`)
- PHP 8.3 with `pdo_sqlite` enabled
  - Install: `winget install PHP.PHP.8.3`
  - Copy `php.ini-development` → `php.ini`, set `extension_dir` to the `ext/` subfolder,
    uncomment `extension=pdo_sqlite` and `extension=sqlite3`

**Once, and after every (re)fetch — build the national databases**
```sh
cd open-data-fetcher
npm run build-db   # data/*.db + sources.json → ../api/data/trees.db + meta.db (~1.5 min)
```

**Terminal 1 — PHP API**
```sh
php -S localhost:8000 -t api/
```

**Terminal 2 — Vite dev server**
```sh
cd app
npm run dev   # http://localhost:5173
```

Vite proxies `/api/*` → `http://localhost:8000`, so the frontend calls `/api/tiles` with no CORS issues. In production both live on the same server; no proxy is needed and no code differs between dev and prod.

**Browsing the database:** the **SQLite Viewer** VS Code extension (by Florian Klampfer) opens `.db` files directly in the editor.

---

## Deployment

- PHP server with `pdo_sqlite` (enabled by default on most shared hosting)
- Upload `api/index.php`, `api/.htaccess`
- Upload `api/data/trees.db` and `api/data/meta.db`. Upload them under temporary names and rename on the server, so the API never reads a half-uploaded file. **Never overwrite `api/data/issues.db`** — it holds user-reported issues written by the live API.
- Upload `app/dist/` as the web root (or a subdirectory)
- No database server, no Node.js on the server
- `VITE_API_BASE` env var overrides the API base URL for subdirectory deployments
- Add your production domain to the `ALLOWED_ORIGINS` array in `api/index.php` (see [API access control](#api-access-control) below)
- Responses are gzipped by PHP (`ob_gzhandler`) unless the server already compresses

Open browsers notice a new build by itself: every tile response carries the build version, and the app reloads its species dictionary and cache when it changes.

---

## open-data-fetcher

Fetches all trees from each source (mostly public OGC WFS services) into one SQLite file per source in `open-data-fetcher/data/`, and builds the national databases from them.

See [open-data-fetcher/README.md](open-data-fetcher/README.md) for full usage, arguments, available layers, and design notes.

Quick start for Rotterdam:
```sh
cd open-data-fetcher
npm install
node index.js --city rotterdam --all   # → data/rotterdam.db (~200k trees)
npm run build-db                       # → ../api/data/trees.db + meta.db
```

`sources.json` lists the sources the build includes (id = database filename, name, center, type, source metadata, optional `clusterDisableZoom`). `node add-city.js --city <id>` runs the whole pipeline for a new city, ending with the build.

**Key design choices in the fetcher:**
- Uses WFS `GetFeature` requests (not scraping) — stable and within the open-data licence
- Coordinates are requested as WGS84 directly from the server (`SRSNAME=urn:ogc:def:crs:EPSG::4326`) — no client-side reprojection needed
- Uses `sql.js` (SQLite compiled to WASM) rather than `better-sqlite3` to avoid native compilation (`node-gyp`, Visual Studio); the build script uses Node's built-in `node:sqlite` (also no native compilation), since `sql.js` keeps a whole database in WASM memory
- All source-specific data cleaning happens here; the API and client receive only clean, typed values

### National build (`tools/build-db.js`)

Merges every source in `sources.json` into `api/data/trees.db` and `api/data/meta.db`, then renames them into place (a failed build never leaves a half-written database). Besides copying trees it:

- **assigns species ids** — one per `species_binomial` (or raw `species` when there is no binomial), with vernacular names resolved at build time: Dutch curated overrides (`vernacular-nl.db`) win for `nl`, iNaturalist (`vernacular-base.db`) supplies all locales, and the most common name the source datasets use is the Dutch fallback.
- **deduplicates** — rows sharing a source id within 5 m are the same tree listed twice (e.g. all of Assen appears twice ~0.3 m apart; Maastricht has exact duplicates) and are dropped. Rows sharing an id further apart are different trees and keep a suffixed id (`1~2`). Ids used by more than 10 rows in a source are placeholders (`undefined` for all of Dordrecht, `Onbekend` in Deventer): those trees are all kept with generated ids (`undefined~1234`), which are stable only as long as the source data doesn't change.
- **precomputes pyramids** for zoom 5–17: clusters per 64 px cell, species counts per tile, tree counts per source per tile, and species clusters up to zoom 11.

---

## API

PHP reads `trees.db` and `meta.db` (read-only) and `issues.db`.

| Method | URL | Params / body | Returns |
|--------|-----|--------|---------|
| GET | `/api/meta` | — | `{version, sources, species}`; ETag = build version |
| POST | `/api/tiles` | `{"z", "tiles": [[x, y], …], "species"?}` (≤ 100 tiles) | `{version, tiles: [...]}` — see below |
| GET | `/api/species` | `z, x0, x1, y0, y1` (tile range, ≤ 400 tiles) | `[[speciesId, count], …]`, most common first |
| GET | `/api/tree` | `source, id` | tree details object |
| GET | `/api/nearest` | `species, lat, lon` | nearest tree of the species as `{source, id, lat, lon, speciesId, street, distance}` (distance in metres), or 404 |
| POST | `/api/trees/details` | `{"trees": [[source, id], …]}` (≤ 200) | array of tree details objects |
| POST | `/api/flag` | issue report | `{ok}` |
| GET | `/api/issues` | — | `{trees, species}` |
| POST | `/api/issues/resolve` | `{type, …}` | `{ok}` |
| GET | `/api/health` | — | tree/source/species counts and build version |

Tiles use standard web-mercator `z/x/y` indices (256 px), the same as the map's base layer. The client, the API and the build script share the same tile math.

**Tile object** — one per requested tile:
```json
{ "x": 16808, "y": 10828, "count": 1135, "sources": { "rotterdam": 1000, "barendrecht": 104, "ridderkerk": 31 },
  "clusters": [[51.88182, 4.55816, 312], …] }
{ "x": 67233, "y": 43315, "count": 92, "sources": { "rotterdam": 92 },
  "trees": { "rotterdam": [["176863", 51.883696, 4.553936, 79], …] } }
```
- `clusters`: `[lat, lon, count]` per 64 px cell (cell mean position), when the tile holds more than 500 trees (or more than 500 of the filtered species)
- `trees`: `[id, lat, lon, speciesId]` grouped by source, otherwise. Above zoom 17 (beyond the pyramids) tiles are always trees.
- `sources`/`count`: trees per source and in total (counting only the filtered species in `count` when `species` is given)

**Source object** (in `/api/meta`):
```json
{
  "id": "rotterdam", "name": "Rotterdam", "type": "city",
  "center": [51.9225, 4.4792],
  "bbox": { "s": 51.845, "n": 51.994, "w": 4.112, "e": 4.600 },
  "tree_count": 200242,
  "meta": { "source": "Gemeente Rotterdam", "lastFetched": "2026-06-23" }
}
```
- `type`: `'city'` for municipalities, `'institution'` for arboretums and similar
- `clusterDisableZoom`: optional; while this source is in view, markers keep clustering up to this zoom (dense, small datasets like arboretums)

**Species** (in `/api/meta`): `[id, key, binomial, {nl?, en?, de?, fr?}]`. `key` is the binomial, or the raw species string when no binomial could be resolved. Names are resolved client-side, so switching language needs no request.

**Tree details object:**
```json
{
  "source": "rotterdam", "id": "176863", "lat": 51.883696, "lon": 4.553936,
  "species_id": 79, "species": "SORBUS INTERMEDIA", "species_cultivar": null,
  "year_planted": "2008", "neighbourhood": "GROOT IJSSELMONDE", "street": "NIEUWENOORD",
  "trunk_diameter": 0.15, "crown_spread": 3
}
```

Issues keep a `city` column in `issues.db`; it holds the source id.

### API access control

The API rejects cross-origin browser requests from unknown origins. `ALLOWED_ORIGINS` in [api/index.php](api/index.php) controls the allowlist:

```php
define('ALLOWED_ORIGINS', [
    'http://localhost:5173',       // Vite dev server
    'http://localhost:8000',       // PHP built-in dev server
    'https://boxofchocolates.nl',  // production
]);
```

Add or replace the production domain in this array. Requests with no `Origin` header (same-origin browser requests in production, direct tool calls) are always allowed. Requests with an `Origin` not in the list receive a `403`.

### Vernacular names

Vernacular names are part of the species dictionary in `/api/meta`, resolved at build time from two layers in priority order:

| Layer | Source | File |
|---|---|---|
| Override | Dutch curated names (Wikipedia + Bomenbieb + DB votes) | `open-data-fetcher/data/vernacular-nl.db` |
| Base | iNaturalist vernacular names for all languages | `open-data-fetcher/data/vernacular-base.db` |
| Fallback (Dutch only) | Most common name in the source datasets | per-source `name_vernacular` |

Both vernacular databases are built by scripts in `open-data-fetcher/tools/vernacular/` — see [open-data-fetcher/README.md](open-data-fetcher/README.md) for details. Rebuild the national databases afterwards.

---

## SQLite schema

**Per source** (`open-data-fetcher/data/<id>.db`, written by the fetcher, input to the build):

```sql
CREATE TABLE trees (
    city, lat, lon, id, year_planted,
    name_vernacular,   -- sanitised Dutch name from source, e.g. "ZOMEREIK"; NULL if none
    species,           -- original full value, e.g. "QUERCUS ROBUR 'FASTIGIATA KOSTER'"
    species_binomial,  -- clean binomial, e.g. "QUERCUS ROBUR" or "ACER × FREEMANII"
    species_cultivar,  -- normalised cultivar/trade code; NULL if none
    neighbourhood, street,
    trunk_diameter,    -- metres
    crown_spread,      -- metres
    last_fetched
);
```

`species_binomial`, `species_cultivar`, and `name_vernacular` are written by the fetcher at import time. Non-botanical entries (`ASSORTIMENT ONBEKEND`, `OVERIG`, etc.) are dropped entirely and never written to the DB.

**National** (`api/data/trees.db`, built):

```sql
CREATE TABLE trees (source_idx, id, lat, lon, species_id, species, species_cultivar,
                    name_vernacular_src, year_planted, neighbourhood, street,
                    trunk_diameter, crown_spread);           -- rows sorted by position
CREATE UNIQUE INDEX idx_source_id       ON trees (source_idx, id);
CREATE INDEX        idx_lat_lon         ON trees (lat, lon);
CREATE INDEX        idx_species_lat_lon ON trees (species_id, lat, lon);

-- pyramids, zoom 5–17 (WITHOUT ROWID)
cluster_cell (z, cx, cy, count, lat, lon)             -- 64 px cells
species_cell (z, species_id, cx, cy, count, lat, lon) -- 64 px cells, zoom ≤ 11
tile_species (z, x, y, species_id, count)             -- 256 px tiles
tile_source  (z, x, y, source_idx, count)             -- 256 px tiles
```

**Metadata** (`api/data/meta.db`, built): `build(version, built_at, tree_count)`, `sources(idx, id, name, type, center_lat, center_lon, s, n, w, e, tree_count, last_fetched, cluster_disable_zoom, meta_json)`, `species(id, key, binomial, count, nl, en, de, fr)`.

---

## Web app

### Stack and package rationale

| Package | Why |
|---|---|
| **Vite** | Fast dev server, near-zero config for a SPA |
| **React + TypeScript** | Component model; TS catches type errors at the React ↔ Leaflet boundary |
| **Tailwind CSS** | Utility classes suit map overlays well (positioning, transparency, backdrop-blur) |
| **shadcn/ui** | Radix UI primitives copied into the codebase — full ownership, no version lock |
| **Zustand** | ~1 KB, no boilerplate, components subscribe to exact slices avoiding extra re-renders |
| **Leaflet.js** | Mature, well-documented map library; intentionally kept outside React's render cycle |
| **Leaflet.MarkerCluster** | Clustering plugin; avoids rendering thousands of overlapping markers |
| **Lucide React** | Consistent icon set |

### Architecture

React state is the single source of truth. Leaflet is managed through a `MapController` class with no React imports. A `useMap` hook bridges the two worlds. This separation means Leaflet never triggers re-renders, and React never touches the map DOM.

```
React store (Zustand)
      ↑  callbacks from MapController → store setters
      ↓  useEffect → controller.setTrees / setServerClusters / highlightSpecies / …

┌─────────────────────────┐     ┌──────────────────────────┐
│  <Map> component        │     │  <InfoPopup>             │
│  div ← useMap hook      │     │  SpeciesListPanel        │
│  MapController          │     │  TreeDetailPanel         │
│  (Leaflet lives here,   │     │  FavouritesPanel         │
│   untouched by React)   │     │  SourcesPanel, …         │
└─────────────────────────┘     └──────────────────────────┘
```

**`MapController`** (`src/map/MapController.ts`) — owns the Leaflet map: tree markers and server clusters (as markers with a tree count) in one markercluster group, favourites, the place markers overlay and the selection ring. Exposes imperative methods; fires outward via `onMoveEnd` and click callbacks.

**`useMap`** (`src/map/useMap.ts`) — holds a `MapController` in a `useRef`. Wires callbacks to store setters, keeps the URL position up to date, handles back/forward, and calls controller methods as side effects of store changes.

**`useTileLoader`** (`src/map/useTileLoader.ts`) — on every map move (at once after a zoom step, after `DEBOUNCE_MS` after panning; a new move cancels a pending or running load): takes the 256 px tiles covering the viewport at the current zoom, loads the missing ones with one `POST /api/tiles`, and publishes what's in view to the store (trees, clusters, counts per source).

**`TileCache`** (`src/map/tileCache.ts`) — LRU cache of tile payloads keyed by build version, species filter and `z/x/y`. A tile the server sent as individual trees holds all trees of its area, so its descendant tiles at higher zooms are derived without a request.

**`useSpeciesInView`** (`src/api/useSpeciesInView.ts`) — species in view for the species list: counted from the loaded trees when the whole view is in tree mode, otherwise from `/api/species` over tiles one zoom finer than the map.

**`createSpeciesIcon`** (`src/map/markerIcon.ts`) — derives a 4-char code from the binomial name (`QUERCUS ROBUR` → `QuRo`), renders an SVG `L.DivIcon`, and caches the result per species. Genus-only entries use `Ge??`.

### App source layout

```
src/
  types.ts                      shared TypeScript interfaces (Tree, TreeDetails, Source, Meta, …)
  config.ts                     tunable constants
  store.ts                      Zustand store
  App.tsx                       loads /api/meta, renders map + panels
  main.tsx
  api/
    trees.ts                    API client (meta, tiles, species, details, issues)
    useTreeDetails.ts           tree details on demand (single + batched), session cache
    useSpeciesInView.ts         species in the current view
    useTreePhotos.ts            iNaturalist two-step fetch + session cache
  lib/
    species.ts                  species id → names for the current locale
    treeKey.ts                  "source:id" key of a tree
    favouritesStorage.ts        localStorage: favourites
    recentCitiesStorage.ts      localStorage: recently picked places
  map/
    MapController.ts            Leaflet wrapper class, no React imports
    useMap.ts                   React ↔ MapController bridge
    useTileLoader.ts            tile loading orchestration
    tileCache.ts                tile cache with derivation from tree-mode ancestors
    mercator.ts                 web-mercator tile math
    urlState.ts                 position/tree in the URL hash, history handling
    markerIcon.ts               SVG DivIcons (species, clusters, groups, places)
    layers.ts                   tile layer definitions (streets/satellite/topo/light)
    useMapClickHandlers.ts      marker click → store actions
  components/
    Map.tsx                     map div + floating button bar
    InfoPopup.tsx               popup shell, shared CloseButton/CollapseButton
    CityButton.tsx              place picker (recent places, all places overlay)
    SourcesButton.tsx
    SpeciesFilterBadge.tsx      active filter indicator + clear button
    …                           Location, Fullscreen, Layer, Settings, Favourites, Species, Issues buttons
    panels/
      SpeciesListPanel.tsx      species in view with search, filter and nearest-tree actions, expandable to trees
      TreeDetailPanel.tsx       tree details + links + photo thumbnail
      FavouritesPanel.tsx       saved favourites grouped by source
      SourcesPanel.tsx          datasets in view
      SamePointListPanel.tsx    trees sharing one coordinate
      IssuesPanel.tsx           reported data issues (debug mode)
  translations/
    locale.ts                   supported locales, labels, Intl tag mapping
    strings.ts                  flat UI string dictionary per locale
    useT.ts                     useT() hook — translate + {var} interpolation
    cityFields.ts               resolves per-locale source metadata (e.g. description)
```

### Zustand store (`src/store.ts`)

| Field | Purpose |
|---|---|
| `meta` / `speciesById` / `sourcesById` | Build version, sources and species dictionary from `/api/meta` |
| `visibleTrees` / `clusters` | Trees and server clusters in the current view |
| `sourcesInView` / `countInView` / `allTreeMode` | Per-source and total counts in view; whether the whole view is individual trees |
| `popupView` | Which panel is open, or `null` |
| `speciesFilter` | Active species filter (species id, `null` = no filter) |
| `placesOverlay` | Whether the places overlay replaces the trees on the map |
| `nameMode` / `locale` / `tileLayerId` | Preferences; persisted in `localStorage` |
| `favourites` | Saved trees keyed by `source:id`; persisted in `localStorage` |
| `currentZoom` / `currentCenter` | Live map position; drives the debug overlay |
| `pendingTree` / `pendingFlyTo` / `pendingHighlight…` | Coordinate "fly to and highlight/open" across components |

### Configuration constants (`src/config.ts`)

| Constant | Default | Purpose |
|---|---|---|
| `DEBOUNCE_MS` | `300` | Delay after panning before loading tiles; a zoom step loads at once, and any new move cancels a pending or running load |
| `MAX_CACHE_TILES` | `2000` | LRU limit of the tile cache |
| `MIN_MAP_ZOOM` | `5` | Lowest map zoom (the pyramids start here) |
| `NL_CENTER` / `NL_ZOOM` | `[52.22, 5.29]` / `7` | National overview |
| `PLACES_OVERLAY_MAX_ZOOM` | `11` | Zooming in beyond this hides the places overlay |
| `PLACE_MAX_ZOOM` | `17` | Zoom cap when fitting the map to a place |
| `CLUSTER_DISABLE_ZOOM` | `18` | At and above this zoom markers are individual (per-source override possible) |
| `NEAREST_TREE_ZOOM` | `18` | Zoom used when flying to the nearest tree of a species |
| `SHARE_ZOOM` | `19` | Zoom used when opening a shared tree link |

API limits (`MAX_TILES_PER_REQUEST`, `MAX_SPECIES_TILES`, `MAX_DETAILS_PER_REQUEST`) mirror the constants in `api/index.php`. The tree/cluster threshold per tile (`TILE_TREE_LIMIT`, 500) lives in the API only.

### Map tile layers (`src/map/layers.ts`)

| ID | Label | Source |
|---|---|---|
| `streets` | Straat | OpenStreetMap |
| `satellite` | Satelliet | Esri World Imagery |
| `topo` | Topografisch | OpenTopoMap |
| `light` | Licht | CARTO Light |

---

## Species fields

The fetcher extracts structured fields from the raw source string at import time. All cleaning logic is in the fetcher; the API and client receive only pre-cleaned values.

| Context | Field used |
|---|---|
| Marker code (`QuRo`, `AcFr`) | species `key` (binomial, or raw species string) |
| Wikipedia / Google / iNaturalist | `species_binomial` |
| Species list, search, filter, nearest | species id (one per binomial) |
| Tree detail title | binomial + `species_cultivar` |

**Wikipedia URL:** `"QUERCUS ROBUR"` → `https://en.wikipedia.org/wiki/Quercus_robur` (first word title-cased, rest lowercase, joined with `_`).

**Genus-only entries** (one word in `species_binomial`): marker code uses `Ge??`, Wikipedia links to the genus article.

See [open-data-fetcher/README.md](open-data-fetcher/README.md) for the full sanitisation pipeline (binomial extraction, cultivar extraction, vernacular name cleaning, typo corrections).
