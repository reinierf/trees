# Backlog

Nice-to-have improvements to pick up later.

- [ ] What to do with species 'Onbekend' (zie Zandvoort, e.g http://localhost:5173/#/zandvoort?tree=708781&lat=52.3797354&lon=4.543056)
- [ ] Sort species list by name or count
- [ ] Notable trees - filter, different marker icon
- [ ] Add a settings menu (togglable with a gear icon button) in which user can choose language, choose naming mode. Move the naming mode UI out of the SpeciesList and Favourites list.
- [ ] Filters + zoeken
- [ ] Somehow show selected tree if behind popup (or indicate that it is behind)
- [ ] Prune unused fields in fetcher and dbs
- [ ] Localisation of UI: implement i18next. 

## UI / Components

- [ ] **PanelHeader component** — `SpeciesListPanel` and `FavouritesPanel` share an identical header shell (`flex items-center justify-between px-4 py-3` wrapper + `flex items-center gap-2` right-side button group). Extract into a shared `PanelHeader` component in `InfoPopup.tsx` or a new file. `TreeDetailPanel` differs enough (different padding, button title, second row) to leave untouched.
