# Bomen

Interactive map of municipal trees for Dutch cities. Data is loaded on demand for the visible viewport; no full dataset is downloaded upfront.

**Cities:** Rotterdam · Amsterdam · Den Haag · Groningen · Utrecht · Arnhem · Nijmegen · Zwolle · Eindhoven · Amersfoort · Breda · Assen

---

## Features

- **Viewport-based loading** — trees are fetched only for the visible bounding box. A spatial tile cache avoids redundant requests when panning.
- **Species markers** — each tree is rendered as a circular SVG marker with a 4-char species code (`QuRo` for *Quercus robur*). Markers cluster at lower zoom levels.
- **Species list panel** — shows all species in the current view with counts; expanding a species lists individual trees; clicking navigates the map to the tree.
- **Tree detail panel** — full tree info (species, Dutch name, year planted, street, trunk diameter, crown spread) with a Wikipedia link and a photo thumbnail.
- **Tree photos** — species photos fetched on demand from the [iNaturalist API](https://api.inaturalist.org/v1/) using the binomial name. A thumbnail appears in the detail panel; tapping it opens a full-screen modal with a swipeable photo gallery and per-photo attribution. Photos with no licence (`all rights reserved`) are excluded; all others are shown with their iNaturalist attribution string. Images are hot-linked from iNaturalist's S3 CDN — no self-hosting required. Results are cached in-memory per species for the session lifetime.
- **Species filter** — search the full city species list; filter the map to a single species. Active filter persists across map moves.
- **Favourites** — save trees across cities; stored in `localStorage`.
- **Name mode toggle** — switch between scientific and vernacular (common) names throughout the UI.
- **Map layers** — streets (OSM), satellite (Esri), topographic (OpenTopoMap), light (CARTO).
- **Current location** — geolocation button flies to user position and places a location dot.
- **Multi-city routing** — URL is `/:city` (e.g. `/rotterdam`); auto-switches city when the map centre crosses a city boundary.
- **Persistent map position** — position and zoom restored from `localStorage` on reload (1-day TTL per city).

---

## Project layout

```
open-data-fetcher/   Node.js — pulls tree data from a city's WFS service → SQLite
api/                 PHP — serves tree data over HTTP from SQLite
app/                 Vite + React web app
```

---

## Running locally

**Prerequisites**
- Node.js ≥ 18
- PHP 8.3 with `pdo_sqlite` enabled
  - Install: `winget install PHP.PHP.8.3`
  - Copy `php.ini-development` → `php.ini`, set `extension_dir` to the `ext/` subfolder,
    uncomment `extension=pdo_sqlite` and `extension=sqlite3`

**Terminal 1 — PHP API**
```sh
php -S localhost:8000 -t api/
```

**Terminal 2 — Vite dev server**
```sh
cd app
npm run dev   # http://localhost:5173
```

Vite proxies `/api/*` → `http://localhost:8000`, so the frontend calls `/api/trees` with no CORS issues. In production both live on the same server; no proxy is needed and no code differs between dev and prod.

**Browsing the database:** the **SQLite Viewer** VS Code extension (by Florian Klampfer) opens `.db` files directly in the editor.

---

## Deployment

- PHP server with `pdo_sqlite` (enabled by default on most shared hosting)
- Upload `api/index.php`, `api/.htaccess`, `api/cities.json`
- Upload city databases and vernacular databases into `api/data/` (e.g. `api/data/rotterdam.db`, `api/data/vernacular-nl.db`)
- Upload `app/dist/` as the web root (or a subdirectory)
- No database server, no Node.js on the server
- `VITE_API_BASE` env var overrides the API base URL for subdirectory deployments
- Add your production domain to the `ALLOWED_ORIGINS` array in `api/index.php` (see [API access control](#api-access-control) below)

---

## open-data-fetcher

Fetches all trees from a city's public OGC WFS service and writes a local SQLite file.

See [open-data-fetcher/README.md](open-data-fetcher/README.md) for full usage, arguments, available layers, and design notes.

Quick start for Rotterdam:
```sh
cd open-data-fetcher
npm install
node index.js --all --format sqlite   # → bomen-rotterdam.db (~200k trees)
```

Copy the resulting `.db` into `api/data/`.

**Key design choices in the fetcher:**
- Uses WFS `GetFeature` requests (not scraping) — stable and within the open-data licence
- Coordinates are requested as WGS84 directly from the server (`SRSNAME=urn:ogc:def:crs:EPSG::4326`) — no client-side reprojection needed
- Uses `sql.js` (SQLite compiled to WASM) rather than `better-sqlite3` to avoid native compilation (`node-gyp`, Visual Studio)
- All source-specific data cleaning happens here; the API and client receive only clean, typed values

---

## API

PHP reads city SQLite databases. The active city is selected via a `city` query param (matching the database filename, e.g. `rotterdam` → `rotterdam.db`).

| Method | URL | Params | Returns |
|--------|-----|--------|---------|
| GET | `/api/trees` | `s,n,w,e` (bbox), `city`, `species?`, `strict?`, `limit?` | array of tree objects |
| POST | `/api/trees` | JSON body (see below) | array of tree objects |
| GET | `/api/species` | `city`, `q?` (search string) | array of species items |
| GET | `/api/cities` | — | array of city objects from `cities.json` |
| GET | `/api/vernacular-names` | — | map of `species_binomial → {nl?, en?, de?, fr?}` |
| GET | `/api/health` | — | `{status, trees}` |

`s/n/w/e` are WGS84 lat/lon for south/north/west/east of the viewport. Default limit 500, max 20 000.

`POST /api/trees` accepts multiple bboxes and returns the union, deduplicated by tree `id`:
```json
{
  "bboxes": [
    { "s": 51.88, "n": 51.90, "w": 4.47, "e": 4.52 },
    { "s": 51.90, "n": 51.92, "w": 4.50, "e": 4.55 }
  ],
  "city": "rotterdam",
  "limit": 2000
}
```

Optional `strict` param (default `false`):
- `strict=false` — filter by `species_binomial` (all cultivars match)
- `strict=true` — filter by `(species_binomial, species_cultivar)` (per-cultivar)

**Tree object**
```json
{
  "lat": 51.8825586,
  "lon": 4.5144985,
  "id": "67112",
  "year_planted": "1948",
  "name_vernacular": "WITTE ABEEL",
  "species": "POPULUS NIGRA 'VEREECKEN'",
  "species_binomial": "POPULUS NIGRA",
  "species_cultivar": "VEREECKEN",
  "genus": "POPULUS",
  "neighbourhood": "VREEWIJK",
  "street": "SMEETSLANDSEDIJK",
  "trunk_diameter": 1.11,
  "crown_spread": 20,
  "last_updated": "2026-02-19 00:00:00"
}
```

**Species item** (from `GET /api/species`)
```json
{
  "species": "QUERCUS ROBUR",
  "species_binomial": "QUERCUS ROBUR",
  "name_vernacular": "ZOMEREIK",
  "count": 4231
}
```

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

`GET /api/vernacular-names` is fetched once at app startup and stored in the
Zustand store. Components resolve names client-side — language switching requires
no re-fetch.

The response is a flat map keyed by `species_binomial` (proper-cased):

```json
{
  "Quercus robur": { "nl": "Zomereik", "en": "English oak", "de": "Stieleiche" },
  "Acer platanoides": { "nl": "Noorse esdoorn", "en": "Norway maple" }
}
```

The API merges two layers in priority order:

| Layer | Source | File |
|---|---|---|
| Override | Dutch curated names (Wikipedia + Bomenbieb + DB votes) | `vernacular-nl.db` |
| Base | iNaturalist vernacular names for all languages | `vernacular-base.db` |

Dutch names from the override layer take precedence over iNaturalist. English,
German, and French always come from iNaturalist. Both databases are built by
scripts in `open-data-fetcher/tools/vernacular/` — see
[open-data-fetcher/README.md](open-data-fetcher/README.md) for details.

---

## SQLite schema

One database per city, placed in `api/data/`. Filename matches the city `id` in `cities.json`.

```sql
CREATE TABLE trees (
    lat              REAL,
    lon              REAL,
    id               TEXT,
    year_planted     TEXT,
    name_vernacular  TEXT,   -- sanitised Dutch name from source, e.g. "ZOMEREIK"; NULL if none
    species          TEXT,   -- original full value, e.g. "QUERCUS ROBUR 'FASTIGIATA KOSTER'"
    species_binomial TEXT,   -- clean binomial, e.g. "QUERCUS ROBUR" or "ACER × FREEMANII"
    species_cultivar TEXT,   -- normalised cultivar/trade code; NULL if none
    genus            TEXT,   -- e.g. "QUERCUS"
    neighbourhood    TEXT,
    street           TEXT,
    trunk_diameter   TEXT,   -- metres
    crown_spread     TEXT,   -- metres
    last_updated     TEXT    -- "YYYY-MM-DD HH:MM:SS"
);
CREATE INDEX idx_lat_lon          ON trees (lat, lon);
CREATE INDEX idx_species          ON trees (species);
CREATE INDEX idx_species_binomial ON trees (species_binomial);
CREATE INDEX idx_species_cultivar ON trees (species_binomial, species_cultivar);
```

`species_binomial`, `species_cultivar`, and `name_vernacular` are written by the fetcher at import time. Non-botanical entries (`ASSORTIMENT ONBEKEND`, `OVERIG`, etc.) are dropped entirely and never written to the DB.

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
| **React Router** | `/:city` URL routing; city switch is a navigation, not a state change |
| **Lucide React** | Consistent icon set |

### Architecture

React state is the single source of truth. Leaflet is managed through a `MapController` class with no React imports. A `useMap` hook bridges the two worlds. This separation means Leaflet never triggers re-renders, and React never touches the map DOM.

```
React store (Zustand)
      ↑  callbacks from MapController → store setters
      ↓  useEffect → controller.setTrees / highlightSpecies / …

┌─────────────────────────┐     ┌──────────────────────────┐
│  <Map> component        │     │  <InfoPopup>             │
│  div ← useMap hook      │     │  SpeciesListPanel        │
│  MapController          │     │  TreeDetailPanel         │
│  (Leaflet lives here,   │     │  FavouritesPanel         │
│   untouched by React)   │     │  SearchOverlay           │
└─────────────────────────┘     └──────────────────────────┘
```

**`MapController`** (`src/map/MapController.ts`) — owns the Leaflet map, marker layer, and cluster layer. Exposes imperative methods; fires outward via `onMoveEnd` and `onMarkerClick` callbacks.

**`useMap`** (`src/map/useMap.ts`) — holds a `MapController` in a `useRef`. Wires callbacks to store setters. Watches store state and calls controller methods as side effects. Restores map position from `localStorage` on mount (1-day TTL per city).

**`tileCache`** (`src/map/tileCache.ts`) — spatial tile cache over a 0.005° × 0.005° grid (~556 m × 342 m at Rotterdam's latitude). On every map move: computes which grid cells intersect the viewport, subtracts cached cells, merges the missing cells into the minimum set of rectangular bboxes (scanline merge), and sends one `POST /api/trees`. LRU eviction at 666 cells.

**`createSpeciesIcon`** (`src/map/markerIcon.ts`) — derives a 4-char code from the binomial name (`QUERCUS ROBUR` → `QuRo`), renders an SVG `L.DivIcon`, and caches the result per species. Genus-only entries use `Ge??`.

**`useCitySwitcher`** (`src/map/useCitySwitcher.ts`) — on every `moveend`, checks if the map centre has crossed into a different city's bounding box and navigates to `/:newCity` via React Router if so.

### App source layout

```
src/
  types.ts                      shared TypeScript interfaces (Tree, City, Bbox, …)
  config.ts                     tunable constants
  store.ts                      Zustand store
  App.tsx                       city routing, cities fetch
  main.tsx
  api/
    trees.ts                    POST /api/trees, GET /api/species, GET /api/cities, GET /api/vernacular-names
    useTreePhotos.ts            iNaturalist two-step fetch + session cache
  map/
    MapController.ts            Leaflet wrapper class, no React imports
    useMap.ts                   React ↔ MapController bridge
    tileCache.ts                spatial tile cache + bbox merge
    markerIcon.ts               SVG DivIcon, cached per species
    layers.ts                   tile layer definitions (streets/satellite/topo/light)
    positionStorage.ts          localStorage: map position per city
    useTreeLoader.ts            tree loading orchestration
    useMapClickHandlers.ts      marker click → store actions
    useCitySwitcher.ts          auto city detection from map centre
  components/
    Map.tsx                     map div + floating button bar
    InfoPopup.tsx               popup shell, shared CloseButton/CollapseButton
    LocationButton.tsx          geolocation (idle/loading/error states)
    FullscreenButton.tsx
    LayerButton.tsx             tile layer switcher
    FavouritesButton.tsx
    SearchButton.tsx
    SearchOverlay.tsx           full-city species search with keyboard navigation
    SpeciesButton.tsx
    SpeciesFilterBadge.tsx      active filter indicator + clear button
    CityButton.tsx
    NameModeToggle.tsx          scientific ↔ vernacular name display
    LoadingSpinner.tsx
    TreeImageModal.tsx          species photo viewer (portal, swipeable gallery)
    panels/
      SpeciesListPanel.tsx      tree count + expandable species list
      TreeDetailPanel.tsx       full tree detail + Wikipedia link + photo thumbnail
      FavouritesPanel.tsx       saved favourites grouped by city
```

### Zustand store (`src/store.ts`)

| Field | Purpose |
|---|---|
| `popupView` | Which panel is open (`species-list`, `tree-detail`, `favourites`) or `null` |
| `visibleTrees` | Trees in the current viewport; drives the species list |
| `speciesFilter` | Active species filter (`null` = no filter) |
| `nameMode` | `'scientific'` or `'vernacular'`; persisted in `localStorage` |
| `tileLayerId` | Active map layer; persisted in `localStorage` |
| `favourites` | Saved trees per city ID; persisted in `localStorage` |
| `currentZoom` / `currentCenter` | Live map position; drives the debug overlay |
| `citySpecies` | Full species list for the current city; used by search |
| `vernacularNames` | `species_binomial → {nl?, en?, de?, fr?}`; fetched once at startup from `/api/vernacular-names` |
| `pendingTreeId` / `pendingCenter` | Coordinate a "fly to and highlight" when navigating from the favourites panel |

### Configuration constants (`src/config.ts`)

| Constant | Default | Purpose |
|---|---|---|
| `CELL_SIZE_DEG` | `0.005` | Grid cell size in degrees |
| `MAX_VIEWPORT_DEG2` | `0.04` | Area threshold above which fetch is skipped |
| `MAX_CACHE_CELLS` | `666` | LRU eviction limit |
| `DEBOUNCE_MS` | `300` | Delay after pan/zoom before triggering load |
| `MIN_FETCH_ZOOM` | `16` | Below this zoom fetch is skipped; "zoom in" banner shown |
| `MIN_CITY_SWITCH_ZOOM` | `11` | Below this zoom auto city-switching is suppressed |
| `CLUSTER_DISABLE_ZOOM` | `18` | At and above this zoom markers are individual |
| `MAP_ZOOM` | `14` | Initial zoom |
| `SHARE_ZOOM` | `19` | Zoom used when navigating to a shared/favourited tree |
| `API_LIMIT` | `20000` | Max trees per POST request |

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
| Marker code (`QuRo`, `AcFr`) | `species_binomial` |
| Wikipedia URL | `species_binomial` |
| Species list (default) | `species_binomial` |
| Species list (strict) | `(species_binomial, species_cultivar)` |
| Tree detail display | `species` (full original) |
| API filtering (default) | `species_binomial` |
| API filtering (strict) | `(species_binomial, species_cultivar)` |

**Wikipedia URL:** `"QUERCUS ROBUR"` → `https://en.wikipedia.org/wiki/Quercus_robur` (first word title-cased, rest lowercase, joined with `_`).

**Genus-only entries** (one word in `species_binomial`): marker code uses `Ge??`, Wikipedia links to the genus article.

See [open-data-fetcher/README.md](open-data-fetcher/README.md) for the full sanitisation pipeline (binomial extraction, cultivar extraction, vernacular name cleaning, typo corrections).
