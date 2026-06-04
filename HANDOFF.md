# Bomen Rotterdam — Web App Handoff

## Goal
Build a web app that shows Rotterdam municipal trees on an interactive map.
The map fetches only the trees visible in the current viewport.

## What exists

### `open-data-fetcher/index.js`
Node.js script that pulls tree data from Rotterdam's public WFS service and
writes it locally.

```sh
node index.js --all --format sqlite   # fetch all ~200k trees → bomen-rotterdam.db
node index.js --all --format json     # same → bomen-rotterdam.json
node index.js --count 500 -d          # dry run, 500 trees to console
```

Deps: `xml2js`, `proj4`, `sql.js`

### `api/index.php`
PHP API that reads `bomen-rotterdam.db` (place the file next to `index.php`).

**Endpoints**

| Method | URL | Params | Returns |
|--------|-----|--------|---------|
| GET | `/api/trees` | `s,n,w,e` (bbox), `species?`, `strict?`, `limit?` | array of tree objects |
| POST | `/api/trees` | JSON body (see below), `limit?` | array of tree objects |
| GET | `/api/species` | `q?` (search string) | array of `{species, species_binomial, name_indigenous}` |
| GET | `/api/health` | — | `{status, trees}` |

`s/n/w/e` are WGS84 lat/lon for south/north/west/east of the viewport.
Default limit 500, max 2000.

Non-botanical entries are excluded by the fetcher and never written to the DB.
The API has no source-specific exclusion logic.

Optional `strict` param (default `false`):
- `strict=false` — filter by `species_binomial` (all cultivars of a species match)
- `strict=true` — filter by `species` (exact original DB value)

`POST /api/trees` accepts a JSON body with an array of bboxes, returning the
union of all matching trees in a single response:
```json
{
  "bboxes": [
    { "s": 51.88, "n": 51.90, "w": 4.47, "e": 4.52 },
    { "s": 51.90, "n": 51.92, "w": 4.50, "e": 4.55 }
  ],
  "limit": 2000
}
```
The API queries each bbox with OR'd conditions and deduplicates by tree `id`
before returning.

**Example**
```
GET /api/trees?s=51.88&n=51.92&w=4.47&e=4.52&limit=500
POST /api/trees  (body: see above)
GET /api/species?q=eik
GET /api/health
```

### SQLite schema (`bomen-rotterdam.db`)

```sql
CREATE TABLE trees (
    lat              REAL,
    lon              REAL,
    id               TEXT,
    year_planted     TEXT,
    name_indigenous  TEXT,   -- sanitised Dutch name written by fetcher, e.g. "ZOMEREIK"; NULL if no useful name
    species          TEXT,   -- original full value, e.g. "QUERCUS ROBUR 'FASTIGIATA KOSTER'"
    species_binomial TEXT,   -- clean binomial written by fetcher, e.g. "QUERCUS ROBUR" or "ACER × FREEMANII"
    species_cultivar TEXT,   -- normalised cultivar/trade code, e.g. "FASTIGIATA KOSTER" or "FRANKSRED"; NULL if none
    genus            TEXT,   -- e.g. "QUERCUS"
    neighbourhood    TEXT,   -- Rotterdam wijk
    street           TEXT,
    trunk_diameter   TEXT,   -- metres, e.g. "0.49"
    crown_spread     TEXT,   -- metres, e.g. "11"
    last_updated     TEXT    -- "YYYY-MM-DD HH:MM:SS"
);
CREATE INDEX idx_lat_lon          ON trees (lat, lon);
CREATE INDEX idx_species          ON trees (species);
CREATE INDEX idx_species_binomial ON trees (species_binomial);
CREATE INDEX idx_species_cultivar ON trees (species_binomial, species_cultivar);
```

Both `species_binomial` and `name_indigenous` are written by the fetcher at
import time. All source-specific cleaning logic lives in the fetcher — the
API and client have no knowledge of raw or uncleaned values. The original
`species` value is preserved for strict filtering and popup display.

A tree object from the API looks like:
```json
{
  "lat": 51.8825586,
  "lon": 4.5144985,
  "id": "67112",
  "year_planted": "1948",
  "name_indigenous": "WITTE ABEEL",
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

## Local development

**Prerequisites**
- PHP 8.3 (installed via `winget install PHP.PHP.8.3`)
- Node.js (already present for `open-data-fetcher`)
- `pdo_sqlite` extension enabled — copy `php.ini-development` to `php.ini` in
  the PHP install folder, set `extension_dir` to the `ext/` subfolder, and
  uncomment `extension=pdo_sqlite` and `extension=sqlite3`

**Browsing the database**
Install the **SQLite Viewer** VS Code extension (by Florian Klampfer). Open
`open-data-fetcher/bomen-rotterdam.db` directly in VS Code to browse tables,
rows, and run queries without leaving the editor.

**Running locally**

Terminal 1 — PHP API:
```sh
php -S localhost:8000 -t api/
```

Terminal 2 — Vite dev server:
```sh
cd app
npm run dev   # runs on localhost:5173
```

**CORS / proxy**
Vite is configured to proxy `/api/*` → `http://localhost:8000`, so the
frontend always calls `/api/trees` with no CORS issue. In production both
live on the same server and no proxy is needed — zero code difference between
dev and prod.

`vite.config.ts` proxy config:
```ts
server: {
  proxy: {
    '/api': 'http://localhost:8000',
  },
},
```

## Deployment
- PHP server (shared hosting), `pdo_sqlite` must be enabled (on by default in
  most stacks)
- Upload `api/index.php`, `api/.htaccess`, `api/bomen-rotterdam.db`
- Upload `app/dist/` as the web root (or a subdirectory)
- No database server, no Node.js on the server

## Web app — what to build

### Stack
- **Vite + React** — build tooling and UI framework
- **Tailwind CSS** — utility-first styling; well-suited for map overlays (positioning, transparency, backdrop blur)
- **shadcn/ui** — component library built on Radix UI primitives; components are copied into the codebase (full ownership, no version lock); covers panel, collapsible, scroll area, popup etc.
- **Zustand** — lightweight state management (~1KB); single store in `src/store.ts`; components subscribe to only the slices they need
- **Vanilla Leaflet.js** — map library (npm), initialised once in a `useEffect`; React never touches the map DOM
- **Leaflet.MarkerCluster** — clustering plugin (npm)
- OpenStreetMap tile layer
- File structure: `app/` (Vite project root, paired with existing `api/` folder)

### Architecture

React state is the single source of truth. Leaflet is managed through a
`MapController` class that has zero React knowledge. A thin `useMap` hook
bridges the two worlds.

**`MapController` (plain JS class)**
Owns the Leaflet map instance, marker layer, and cluster layer. No React
imports. Exposes imperative methods called by the hook:
```
init(divElement, center?, zoom?)  — creates the Leaflet map; optional center/zoom
                                    override falls back to MAP_CENTER/MAP_ZOOM
setTrees(trees)                   — clears markers and renders the new set
highlightSpecies(spec)            — downlights all markers not matching spec
clearHighlight()                  — resets all markers to normal opacity
destroy()                         — tears down the map on unmount
```
Fires outward via callbacks passed in at construction:
```
onMoveEnd(bounds, zoom, center)  — called when the map stops moving;
                                   center is [lat, lng] of current map centre
onMarkerClick(tree)              — called when a tree marker is clicked
```

**`useMap` hook (React bridge)**
Holds a `MapController` instance in a `useRef`. On mount, reads any saved
position from `localStorage` (`map-position`, 1-day TTL), passes it to
`init()` as overrides, then wires the controller's callbacks to React state
setters. Watches React state and calls controller methods as side effects:
```js
useEffect(() => controller.setTrees(trees),              [trees])
useEffect(() => controller.highlightSpecies(selected),   [selected])
```
On every `onMoveEnd`, writes `{ lat, lon, zoom, savedAt }` to `localStorage`
so the position is restored on the next page load.
Has zero direct Leaflet imports — only talks to the controller.

**`createSpeciesIcon(species)` (pure function)**
Derives the 4-char code from a binomial name (`"QUERCUS ROBUR"` → `"QuRo"`),
generates an SVG `L.DivIcon` circle with Arial text, and caches the result in
a `Map<string, L.DivIcon>`. Called by `MapController` when creating markers.

**Data flow**
```
React state (bbox, selectedSpecies, trees…)
      ↑  controller callbacks → state setters
      ↓  useEffect → controller.setTrees / highlightSpecies / …

┌─────────────────────┐     ┌──────────────────────┐
│  <Map> component    │     │  <Panels>            │
│  div ← useMap hook  │     │  InfoOverlay         │
│  MapController      │     │  Popup               │
│  (Leaflet lives     │     │  future: filters,    │
│   here, untouched   │     │  list, stats         │
│   by React)         │     │                      │
└─────────────────────┘     └──────────────────────┘
```
```

### Features — in scope

**Map & data loading**
- Interactive map centred on Rotterdam
- Fetch trees for the current visible bounding box (`/api/trees?s=&n=&w=&e=`)
  whenever the user stops panning/zooming (debounced)
- Skip the fetch when the bbox exceeds a configured maximum area threshold;
  show a "zoom in to see trees" message instead. Prevents hammering the API
  and rendering thousands of markers when zoomed far out.

**Tree markers**
- Each tree rendered as a circular marker, fixed size at all zoom levels
- Marker generated at runtime using `L.DivIcon` with inline SVG
- Label: 4-char species code derived from the binomial name — first 2 chars of
  genus + first 2 chars of species epithet, capitalised as "AlGl"
  (e.g. *Alnus glutinosa* → "AlGl", *Quercus robur* → "QuRo")
- Font: Arial
- One marker style per species, cached at runtime (not pre-made image files)
- No colour coding by genus or species

**Clustering**
- Overlapping markers are clustered using Leaflet.MarkerCluster
- Cluster marker shows number of trees in cluster only (no species labels)
- Zoom threshold / hide-below-zoom behaviour: TBD

**Click popup**
- Clicking a tree marker opens a popup with:
  - Latin species name
  - Dutch indigenous name
  - Year planted
  - Street
  - Trunk diameter (metres)
  - Crown spread (metres)
  - Link to Wikipedia article for the species
    (e.g. `https://en.wikipedia.org/wiki/Quercus_robur`)
- When a tree is selected, all visible markers of a **different** species are
  downlighted (e.g. reduced opacity / greyed out), making the matching species
  stand out without adding a separate highlight style. Clicking the same tree
  again or closing the popup resets all markers to normal.

**Info overlay**
- Persistent overlay on the map (e.g. top-right corner)
- Shows total number of trees currently visible in the viewport
- Expandable section listing all species present in the current view,
  each with its tree count (e.g. "Quercus robur — 42")
- Clicking a species in the list downlights all trees of other species
  (same downlight behaviour as clicking a tree marker directly)
- Clicking the same species again or clearing the selection resets all
  markers to normal
- Updates automatically whenever the map moves and new data loads

**Debug overlay**
A persistent top-centre overlay shows diagnostic info:
```
z17 · fetch≥16 · solo≥18 · [51.9225, 4.4792]
```
`z` = current zoom · `fetch≥` = MIN_FETCH_ZOOM · `solo≥` = CLUSTER_DISABLE_ZOOM
· bracketed pair = map centre lat/lon (4 dp), ready to copy-paste into `config.ts`
as `MAP_CENTER`.

**Map position persistence**
- On every `moveend`, the hook writes `{ lat, lon, zoom, savedAt }` to
  `localStorage` under key `map-position`.
- On page load, if the saved entry is less than 24 hours old, the map
  initialises at the saved centre and zoom instead of `MAP_CENTER`/`MAP_ZOOM`.
- Stale (>1 day) or missing entries fall back to config defaults silently.
- `currentCenter: [number, number] | null` in the Zustand store is updated on
  every move and drives the debug overlay display.

**Current location**
- A circular button with a `LocateFixed` icon (Lucide), positioned
  bottom-left of the map (absolute, inside the map container)
- Three button states:
  - **idle** — icon visible, clickable
  - **loading** — spinner replaces icon while `getCurrentPosition` is
    pending (timeout 10 s)
  - **error** — brief error label ("Location access denied" /
    "Location unavailable" / "Location timed out") for 3 s, then
    reverts to idle
- Button is hidden when `!navigator.geolocation` (API unavailable)
- On success: map flies to position at zoom 16; a blue location dot
  appears at the user's position
  - Dot: `L.CircleMarker` — radius 8 px, solid blue fill
    (`#3B82F6`), 2 px white stroke, no popup, never clustered
  - Subsequent clicks refresh position and re-centre; dot moves to
    new position
- One-shot only (`getCurrentPosition`, not `watchPosition`) — no
  background location tracking

**MapController additions for current location:**
```
flyToLocation(lat, lon)        — map.flyTo([lat, lon], 16)
setLocationMarker(lat, lon)    — creates L.CircleMarker on first call,
                                  moves it on subsequent calls
```
Both called by `Map.tsx` in the `onLocate` callback — no new Zustand
state needed (location centering is fire-and-forget).

### Client-side tile cache

Rather than fetching the exact viewport bbox on every pan/zoom, the client
maintains a spatial tile cache. This eliminates redundant API calls when the
user pans slightly or revisits an area.

**Grid resolution**
The map is divided into cells of **0.005° × 0.005°**. At Rotterdam's latitude
(~52°N) this is approximately 556 m (lat) × 342 m (lon) — rectangular but
consistent. The asymmetry (~1.6:1) is acceptable: it causes slightly more
cache misses when panning east-west than north-south, which is imperceptible
in practice. If the app ever expands to significantly different latitudes,
revisit switching to a metre-based grid in Web Mercator (EPSG:3857).

Rotterdam fits in roughly 26 × 50 = 1 300 cells total. A typical viewport at
zoom 15 covers ~20–30 cells.

**Cache structure**
```
Map<cellKey, { trees: Tree[], fetchedAt: number }>
```
Cell key: `"${Math.floor(lat / 0.005)}:${Math.floor(lon / 0.005)}"` — one
entry per grid cell, keyed by its south-west corner indices.

**Request flow on every map move**
1. Check viewport area against the configured threshold — abort if too large.
2. Compute the set of grid cells that intersect the current viewport.
3. Subtract cells already present in the cache → `missingCells`.
4. If `missingCells` is empty, render from cache immediately (no fetch).
5. Otherwise merge neighbouring missing cells into the minimum set of
   rectangular bboxes (scanline merge: group cells by row, merge contiguous
   cells within each row into horizontal strips, then merge adjacent rows with
   identical column spans into taller rectangles).
6. Send **one** `POST /api/trees` request with the merged bbox array.
7. On response, distribute each returned tree to its cell by lat/lon and store
   in cache.
8. Render from the full set of cells covering the viewport (cached + newly
   fetched).

In the common case (straight pan) the merge produces 1–2 bboxes. A cold
viewport load typically collapses to a single bbox covering the whole view.

**Cache eviction**
- Maximum **666 cells** in memory (LRU eviction when exceeded).
- No TTL — tree data changes infrequently enough that a session-scoped cache
  is sufficient. A full page reload always starts fresh.
- Memory estimate: ~100 trees × ~150 bytes per cell = ~15 KB/cell →
  666 cells ≈ 10 MB worst case.

**Configuration constants** (single file, easy to tune)
| Constant | Default | Purpose |
|---|---|---|
| `CELL_SIZE_DEG` | `0.005` | Grid cell size in degrees |
| `MAX_VIEWPORT_DEG2` | `0.04` | Area threshold (deg²) above which fetch is skipped (secondary safeguard) |
| `MAX_CACHE_CELLS` | `666` | LRU eviction limit |
| `DEBOUNCE_MS` | `300` | Delay after pan/zoom stops before triggering load |
| `MIN_FETCH_ZOOM` | `17` | Below this Leaflet zoom level fetch is skipped and "Zoom in to see trees" is shown |

### Deferred / not in scope for now
- Species search / autocomplete
- Colour coding by genus
- Zoom threshold behaviour (hide vs. message below a zoom level)
- Prefetching adjacent cells

---

## Species sanitisation

### `species_binomial` extraction rule (implemented in the fetcher)

Applied to the raw `species` value from the Rotterdam WFS source when writing
to the DB. Produces the clean `species_binomial` field.

**Step 1 — normalise whitespace**
Trim and collapse multiple spaces to one.

**Step 2 — check for non-botanical entry**
If the value is in the exclusion list, set `species_binomial = null`:
`ASSORTIMENT ONBEKEND`, `CONIFEREN`, `OVERIG`, `NIET (REGULIER) INBOETEN`

**Step 3 — strip cultivar / trade name suffixes**
Remove everything from the first occurrence of:
- A single-quote `'` (cultivar name)
- An opening parenthesis `(` (trade name code)

e.g. `QUERCUS ROBUR 'FASTIGIATA KOSTER'` → `QUERCUS ROBUR`
e.g. `ACER RUBRUM RED SUNSET ('FRANKSRED')` → `ACER RUBRUM RED SUNSET`

**Step 4 — strip botanical rank markers**
Remove the marker word and everything after it:
`SUBSP.`, `VAR.`, `F.`, `CV`, `CV*`, `SUBSP`, `VAR`

e.g. `PINUS NIGRA SUBSP. LARICIO` → `PINUS NIGRA`
e.g. `ACER CAMPESTRE CV` → `ACER CAMPESTRE`

**Step 5 — extract binomial**
Split the remaining string into words.
- If word[1] is `×` → binomial = `word[0] × word[2]` (hybrid)
- If word[1] exists and does not start with `'` → binomial = `word[0] word[1]`
- If only word[0] exists, or word[1] starts with `'` → genus-only, binomial = `word[0]`

**Known typo corrections** (applied before step 5):
- `METASQUOIA` → `METASEQUOIA`
- `PTEROCAYRA` → `PTEROCARYA`
- `HIBISCUS SYR.` → `HIBISCUS SYRIACUS` (abbreviated epithet)

---

### `species_cultivar` extraction rule (implemented in the fetcher)

Extracts and normalises the cultivar or trade identifier from the raw
`species` value. Stored separately so cross-source matching uses a
normalised tuple rather than a raw string.

**Priority order:**
1. If `('CODE')` pattern found → use `CODE` — the ICNCP-registered cultivar
   code is the most stable identifier across sources
   e.g. `ACER RUBRUM RED SUNSET ('FRANKSRED')` → `FRANKSRED`
2. Else if `'CULTIVAR NAME'` in quotes → strip quotes, uppercase, trim
   e.g. `QUERCUS ROBUR 'FASTIGIATA KOSTER'` → `FASTIGIATA KOSTER`
3. Else if non-marker words remain after the binomial → use those words
   normalised (uppercase, trim)
4. Else → `NULL`

**Cross-source matching:** compare `(species_binomial, species_cultivar)`
tuples. This normalises formatting differences (quote style, case, spacing)
while remaining agnostic about source-specific conventions.

**Limitation:** two sources may use genuinely different cultivar names for
the same tree (e.g. `FASTIGIATA` vs `FASTIGIATA KOSTER`). This is a data
quality problem that normalization alone cannot solve without an external
taxonomy lookup (e.g. GBIF) — out of scope for this app.

**Examples:**

| `species` | `species_cultivar` |
|---|---|
| `QUERCUS ROBUR 'FASTIGIATA KOSTER'` | `FASTIGIATA KOSTER` |
| `ACER RUBRUM RED SUNSET ('FRANKSRED')` | `FRANKSRED` |
| `ACER × FREEMANII AUTUMN BLAZE ('JEFFERSRED')` | `JEFFERSRED` |
| `POPULUS NIGRA 'VEREECKEN'` | `VEREECKEN` |
| `ACER CAMPESTRE CV` | `NULL` |
| `QUERCUS ROBUR` | `NULL` |

---

### How the species fields are used

| Context | Field |
|---|---|
| Marker code (`QuRo`, `AcFr`) | `species_binomial` |
| Wikipedia URL | `species_binomial` |
| Overlay species list (default) | `species_binomial` |
| Overlay species list (strict) | `(species_binomial, species_cultivar)` |
| Popup display | `species` (full original) |
| API filtering (default) | `species_binomial` |
| API filtering (strict) | `(species_binomial, species_cultivar)` |
| Cross-source matching | `(species_binomial, species_cultivar)` |

### Genus-only entries

When `species_binomial` contains only one word (genus, no epithet), e.g.
`ACER`, `MALUS 'ALMEY'` → `MALUS`:
- Marker code: first 2 chars of genus + `??` → `Ma??`
- Wikipedia URL: link to genus article → `https://en.wikipedia.org/wiki/Malus`
- Grouped under genus name in the overlay

### Strict / non-strict toggle (client-side)

A checkbox in the UI controls the grouping and filtering precision:
- **Non-strict (default):** match on `species_binomial` — all cultivars of a
  species grouped together
- **Strict:** match on `(species_binomial, species_cultivar)` — each cultivar
  is its own entry; robust across sources because both fields are normalised

Purely client-side — the API always returns all three species fields.

---

## Indigenous name sanitisation

### Rule (implemented in the fetcher, written directly to `name_indigenous`)

All source-specific cleaning logic lives in the fetcher. The DB stores only
the sanitised value — the API and client need no knowledge of raw formats.
Non-botanical entries are skipped entirely and never written to the DB.

**Step 1 — normalise whitespace**
Trim and collapse multiple spaces to one.

**Step 2 — strip administrative suffix**
Remove everything from the first ` -` (space + hyphen) onward. This one
rule covers all variants:
- ` -NIET TOEPASSEN` (do not use)
- ` -TOEPASBARE CV KIEZEN` / ` -TOEPASBARE CV KIEZEN*`
- ` -TOEPASBARE SOORT / CV KIEZEN` / ` -TOEPASBARE SOORT / CV KIEZEN*`
- Truncated variants (e.g. ` -TOEPASBARE CV KIEZE`)

**Step 3 — strip type markers**
Remove trailing `(CV)` and `(V)` (cultivar / variety markers — redundant
given `species_binomial`). Trim again after removal.

**Step 4 — null-check**
If the result is empty, or matches a known pure-admin string with no useful
name, write `NULL` to the DB and skip the row if `species_binomial` is also
null. Known pure-admin values:
- `-SORTIMENT BEPALEN`
- `NIET INBOETEN`
- ` -TOEPASBARE SOORT / CV KIEZEN` (leading dash, no name before it)

**Known typo correction** (applied in the fetcher alongside species typos):
- `SIERAPPPEL` → `SIERAPPEL`

**Examples**

| Raw DB value | Sanitised |
|---|---|
| `ZOMEREIK` | `ZOMEREIK` |
| `GINKGO (CV)` | `GINKGO` |
| `AARDBEIENBOOM -NIET TOEPASSEN` | `AARDBEIENBOOM` |
| `PRUIM (CV) -TOEPASBARE CV KIEZEN` | `PRUIM` |
| `GEWONE VOGELKERS  -TOEPASBARE CV KIEZE` | `GEWONE VOGELKERS` |
| `-SORTIMENT BEPALEN` | `null` |
| `NIET INBOETEN ` | `null` |

---

## Foundational TypeScript types (`src/types.ts`)

```ts
interface Coordinate {
  lat: number
  lon: number
}

interface Bbox {
  nw: Coordinate   // { lat: north, lon: west }
  se: Coordinate   // { lat: south, lon: east }
}

interface Tree {
  lat: number
  lon: number
  id: string
  year_planted: string
  name_indigenous: string | null  // null if no meaningful Dutch name in DB
  species: string           // original full value, e.g. "QUERCUS ROBUR 'FASTIGIATA KOSTER'"
  species_binomial: string  // clean binomial, e.g. "QUERCUS ROBUR" or "ACER × FREEMANII"
  species_cultivar: string | null  // normalised cultivar/trade code, e.g. "FASTIGIATA KOSTER"
  genus: string             // e.g. "QUERCUS"
  neighbourhood: string
  street: string
  trunk_diameter: number | null
  crown_spread: number | null
  last_updated: string
}

interface SpeciesItem {
  species: string
  name_indigenous: string
}
```

`Bbox.nw`/`se` aligns with Leaflet's `getNorthWest()`/`getSouthEast()` —
converting between our type and `L.LatLngBounds` is direct.

The API's `s/n/w/e` query params map as:
`s = se.lat, n = nw.lat, w = nw.lon, e = se.lon`

## Foundational app structure

**`app/src/` folder layout**
```
types.ts                — shared TS types (above)
config.ts               — CELL_SIZE_DEG, DEBOUNCE_MS, MAX_CACHE_CELLS, etc.
map/
  MapController.ts      — Leaflet wrapper class, no React imports
  useMap.ts             — React hook, bridge between React state and MapController
  tileCache.ts          — spatial tile cache (LRU, grid logic, bbox merging)
  markerIcon.ts         — createSpeciesIcon (SVG DivIcon, cached per species)
api/
  trees.ts              — fetch functions wrapping POST /api/trees
components/
  Map.tsx               — renders the map div + LocationButton overlay, uses useMap hook
  InfoOverlay.tsx       — tree count + expandable species list
  Popup.tsx             — tree detail popup
  LocationButton.tsx    — geolocation button (idle/loading/error states)
App.tsx
main.tsx
```

**React state — Zustand**
State is managed with Zustand (lightweight external store, ~1KB). Components
subscribe to only the slices they need, avoiding unnecessary re-renders. The
`useMap` hook reads and writes the store directly — no prop threading needed.
Scales cleanly as more panels (filters, list, stats) are added.

Store defined in `src/store.ts`:
```ts
interface AppStore {
  selectedSpecies: string | null       // set by marker click OR overlay — drives downlight
  selectedTree:    Tree | null         // set by marker click only — drives popup
  visibleTrees:    Tree[]              // current viewport trees — drives overlay + count
  isLoading:       boolean
  tooZoomedOut:    boolean
  currentZoom:     number
  currentCenter:   [number, number] | null  // current map centre [lat, lon]

  setSelectedSpecies: (s: string | null) => void
  setSelectedTree:    (t: Tree | null) => void
  setVisibleTrees:    (trees: Tree[]) => void
  setIsLoading:       (v: boolean) => void
  setTooZoomedOut:    (v: boolean) => void
  setCurrentZoom:     (z: number) => void
  setCurrentCenter:   (c: [number, number]) => void
}
```

Clicking a tree → sets both `selectedTree` and `selectedSpecies`.
Clicking a species in the overlay → sets `selectedSpecies` only.
Closing popup or re-clicking same tree → clears both.

**Map initial state**
- Centre: `[51.9225, 4.4792]` (Rotterdam)
- Zoom: `14` — small enough to trigger a fetch on load

**Wikipedia URL rule**
`"QUERCUS ROBUR"` → `https://en.wikipedia.org/wiki/Quercus_robur`
First word titlecased, remaining words lowercase, joined with `_`.

**POST `/api/trees` limit**
20 000 trees per request (PHP `MAX_LIMIT`, client `API_LIMIT`). Rotterdam
averages ~117 trees per 0.005° cell. Below `MIN_FETCH_ZOOM` (15) no fetch is
issued, so the maximum practical viewport at fetch time is zoom 15 (~18k trees).
The GET endpoint default (500) is unchanged.

---

## Implementation sequence

Each step is a focused session. HANDOFF is updated if decisions change during
implementation. Status: `[ ]` todo · `[~]` in progress · `[x]` done

After each step: commit changed files. Split into multiple commits when
changes are logically distinct (e.g. a bug fix separate from a feature, or
two independent files with unrelated reasons to change). Each commit message
names the step, lists what changed, and notes any non-obvious decisions made
during implementation (bugs found, approach changes, gotchas).

### ⚠ DB rebuild required
Two fetcher fixes have been made since the last full fetch — run
`node index.js --all --format sqlite` to rebuild `bomen-rotterdam.db`:
1. **Coordinate accuracy** — switched from a 7-parameter Helmert towgs84
   (~29 m error in NL) to requesting WGS84 directly from the WFS
   (`SRSNAME=urn:ogc:def:crs:EPSG::4326`); the server applies its own
   RDNAPTRANS2018 grid correction
2. **Null species_binomial** — `sanitiseTree` now returns null (skips row)
   when `extractSpeciesBinomial` yields null

### Step 1 `[x]` — Fetcher: schema + sanitisation
Update `open-data-fetcher/index.js` to:
- Add `species_binomial` and `species_cultivar` columns to the SQLite schema
- Add indexes `idx_species_binomial` and `idx_species_cultivar`
- Implement the `species_binomial` extraction rule (see Species sanitisation)
  and populate the column on every inserted row
- Implement the `species_cultivar` extraction rule (prefer ICNCP code from
  `('CODE')` pattern, fall back to quoted cultivar name, then remaining words)
  and populate the column on every inserted row
- Implement the `name_indigenous` cleaning rule (see Indigenous name
  sanitisation) and write the sanitised value directly — no raw value stored
- Skip non-botanical entries entirely (do not insert them)
- Apply all known typo corrections (`METASQUOIA`, `PTEROCAYRA`,
  `HIBISCUS SYR.`, `SIERAPPPEL`)
- Re-fetch all trees (`node index.js --all --format sqlite`) to rebuild the
  DB with the new schema and clean data

Verify:
```sh
sqlite3 open-data-fetcher/bomen-rotterdam.db \
  "SELECT species, species_binomial FROM trees LIMIT 20;"
sqlite3 open-data-fetcher/bomen-rotterdam.db \
  "SELECT species, species_binomial FROM trees WHERE species LIKE '%×%' LIMIT 10;"
sqlite3 open-data-fetcher/bomen-rotterdam.db \
  "SELECT species, species_binomial FROM trees WHERE species LIKE '%''%' LIMIT 10;"
```

### Step 2 `[x]` — PHP API
Extend `api/index.php` with:
- `POST /api/trees` multi-bbox endpoint
- `strict` param support (`species_binomial` vs `species` filtering)
- `species_binomial` field included in all tree responses
- No source-specific logic — the API serves pre-cleaned DB data as-is

Verify all endpoints locally:
```sh
php -S localhost:8000 -t api/
curl "http://localhost:8000/api/health"
curl "http://localhost:8000/api/trees?s=51.88&n=51.92&w=4.47&e=4.52"
curl -X POST http://localhost:8000/api/trees \
  -H "Content-Type: application/json" \
  -d '{"bboxes":[{"s":51.88,"n":51.92,"w":4.47,"e":4.52}]}'
```

### Step 3 `[x]` — Project scaffold
Bootstrap `app/` with Vite + React + TypeScript. Install and configure
Tailwind CSS and shadcn/ui. Set up the Vite proxy. Confirm dev server runs
and proxy reaches the PHP API.

### Step 4 `[x]` — Map shell
Implement `MapController` and the `useMap` hook. Render a bare Leaflet map
centred on Rotterdam with an OSM tile layer. No data yet — just confirm the
map renders and map-move events surface to React state.

### Step 5 `[x]` — Data layer
Implement the tile cache (`tileCache.ts`) and the bbox fetch logic. Wire up
`POST /api/trees`. Render trees as simple `CircleMarker` placeholders (no
species icon yet). Confirm trees appear, pan/zoom triggers correct fetches,
and cache prevents redundant requests.

### Step 6 `[x]` — Species markers + clustering
Implement `createSpeciesIcon` (SVG `DivIcon`, 4-char code, Arial, cached per
species). Replace placeholder markers. Wire up Leaflet.MarkerCluster.

### Step 7 `[ ]` — Info overlay
Build the React info overlay: tree count + expandable species list with per-
species counts. Wire to React state so it updates on every map move. Clicking
a species triggers downlight (all other markers dimmed).

### Step 8 `[ ]` — Popup + downlight from marker click
Clicking a tree marker opens the React popup with full details and Wikipedia
link. Non-matching species markers are downlighted. Clicking the same tree
or closing the popup resets all markers.

### Step 9 `[ ]` — Current location button
Add `LocationButton.tsx` and wire it into `Map.tsx`. Implement
`flyToLocation` and `setLocationMarker` on `MapController`. The button
must handle all three states (idle / loading / error) and the location
dot must appear and update correctly. Confirm the feature works end-to-end
in the browser.

### Step 10 `[ ]` — Polish
Loading indicator while fetching. "Zoom in to see trees" message when
viewport exceeds the area threshold. Debounce and threshold tuning.
