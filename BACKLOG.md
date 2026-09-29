# Backlog

Nice-to-have improvements to pick up later.

- [ ] https://belmonte.arboretumexplorer.org/map.aspx
- [ ] https://www.gardenexplorer.org/ Leiden Amsterdam, more
- [ ] https://schovenhorst.nl/bomentuin/ https://schovenhorst.nl/wp-content/uploads/2025/11/Catalogus-Schovenhorst-september-2025.pdf
- [ ] Fix add-city.js (missing valudate-species.js)? See README.
- [x] Datasets for Leeuwarden and Bergen both contain a siginifcant amount of outliers outside the city proper. Due to the zoom level for showing trees/tree clusters, these outliers are probably never found. Suggest a fix for this. — Fixed via per-city `mapZoom`/`minFetchZoom`/`maxViewportDeg2` overrides (since superseded by the map-view rework: server clusters per tile make sparse datasets visible without per-city settings; the overrides are removed) (both datasets are small curated "monumental trees" layers spread across a whole merged municipality; the global `MIN_FETCH_ZOOM=16` gate meant outlying villages were never fetched/visible unless a user already knew to pan there).
- [x] Consider a server-side clustering endpoint (return `{count, lat, lon}` per grid cell instead of individual trees) so low-zoom views can show cluster bubbles across a city's *entire* extent without the per-city `minFetchZoom`/`maxViewportDeg2` workaround above.
  - Pros: works uniformly for every city, including huge ones (Amsterdam ~300k trees) where lowering `MIN_FETCH_ZOOM` globally today would blow past `MAX_VIEWPORT_DEG2`/`API_LIMIT`; response size scales with cluster count, not tree count, so it's the only way to get a "whole city at a glance" overview for large inventories, not just small curated ones; would make outlier discovery a general property of the map instead of a per-city opt-in that has to be remembered for every future sparse/spread dataset (arboretums, monumental-tree-only layers, etc.).
  - Done in the map-view rework (docs/map-view-plan.md): `POST /api/tiles` returns precomputed clusters per 64 px cell for tiles with > 500 trees, individual trees otherwise; clicking a server cluster zooms in.
  - Cons: needs a second rendering path on the client — server clusters are just `{count, lat, lon}` bubbles, not real Leaflet markers grouping already-loaded trees, so clicking one can't spiderfy into individual trees the way `leaflet.markercluster` does today; it'd have to re-center/zoom instead. Needs a zoom-dependent grid cell size (like map tile math) to avoid cluster centroids jittering while panning/zooming, which is more work to get right than a fixed-size grid. `GROUP BY` on rounded lat/lon doesn't use the existing `idx_lat_lon` index for the aggregation itself (only for the bbox range filter), so needs verifying query cost stays low for the biggest cities (~300k rows). Also needs its own cache path in `TileCache`/`useTreeLoader`, since cluster geometry changes with zoom unlike raw per-tree tiles.
- [ ] Fetching binomials and vernaculars still intransparent/messy? Decide what we're interested in: correct/up-to-date binomials or just consistency in binomials and have recognizable names
- [ ] Fix species names: "SORBUS ‘JOSEPH"
- [ ] Add more places
- [ ] Augment city info (monumental only, multiple sources, other?)
- [ ] Sort species list by name or count
- [ ] Filters: year, genus?
- [ ] Somehow show selected tree if behind popup (or indicate that it is behind)
- [x] "Nearest tree of species X": from search/species list, fly to the closest tree of the chosen species relative to the map centre (or GPS position), across all sources. Depends on the single national tree database (one indexed query instead of one per city). — Done: navigation icon on each species row, also for species not in view while searching; `GET /api/nearest`.
- [ ] Maastricht: the WFS layer `maastricht:Bomen` no longer exists on kaartviewer.maastricht.nl (checked 2026-09-29), so the fetcher cannot refresh it. Find the new source. The current database (June 2026) holds every tree exactly twice (identical records); the build drops the copies.
