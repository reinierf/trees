# Backlog

Nice-to-have improvements to pick up later.

- [ ] Add: Woerden, Middelburg, Vlissingen, Goes
- [ ] Add info about dataset in frontend? To indicate moumental only?
- [ ] Sort overrides, remove duplicates
- [ ] When showing overviewmap, dont show buttons except zoom, location and close
- [ ] Lelystad — blocked: no accessible dataset with species data. PDOK BGT works (location-only, ~40k trees) but has zero tree attributes beyond coordinates. `ckan.dataplatform.nl` (municipal dataset) was unreachable. Revisit if municipality publishes a richer open dataset.
- [ ] What to do with species 'Onbekend' (zie Zandvoort, e.g http://localhost:5173/#/zandvoort?tree=708781&lat=52.3797354&lon=4.543056) or 'Standaardboom' (Dordrecht), or 'NOG INVULLEN' (Barendrecht/ALbrandswaard). Is it desirable to keep the trees on the map but mark them unknown somehow? Currently some are filtered out during import by filterSpecies
- [ ] Sort species list by name or count
- [ ] Add a settings menu (togglable with a gear icon button) in which user can choose language, choose naming mode. Move the naming mode UI out of the SpeciesList and Favourites list.
- [ ] Filters: year, genus?
- [ ] Somehow show selected tree if behind popup (or indicate that it is behind)
- [ ] Localisation of UI: implement i18next. 

## UI / Components

- [ ] **PanelHeader component** — `SpeciesListPanel` and `FavouritesPanel` share an identical header shell (`flex items-center justify-between px-4 py-3` wrapper + `flex items-center gap-2` right-side button group). Extract into a shared `PanelHeader` component in `InfoPopup.tsx` or a new file. `TreeDetailPanel` differs enough (different padding, button title, second row) to leave untouched.
