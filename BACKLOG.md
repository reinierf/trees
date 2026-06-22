# Backlog

Nice-to-have improvements to pick up later.

- [ ] The way the binomials are fixed/processed feels messy and intransparent. It uses both overrides.js and cache.json, and takes multiple steps. It feels like there should be a single source of truth for inferring the correct binomial for a raw species values. Maybe a single step is also possible: check raw species against authorative list (fuzzily), if not found: look up in iNat, if not found: strip 2 char epithets and any other last resort fixes. Discuss how this process can be streamlined or made more transparent.
- [ ] Add more places
- [ ] Augment city info (monumental only, multiple sources, other?)
- [ ] Sort species list by name or count
- [ ] Add a settings menu (togglable with a gear icon button) in which user can choose language, choose naming mode. Move the naming mode UI out of the SpeciesList and Favourites list. 
- [ ] Filters: year, genus?
- [ ] Somehow show selected tree if behind popup (or indicate that it is behind)
- [ ] Localisation of UI: implement i18next. 

## UI / Components

- [ ] **PanelHeader component** — `SpeciesListPanel` and `FavouritesPanel` share an identical header shell (`flex items-center justify-between px-4 py-3` wrapper + `flex items-center gap-2` right-side button group). Extract into a shared `PanelHeader` component in `InfoPopup.tsx` or a new file. `TreeDetailPanel` differs enough (different padding, button title, second row) to leave untouched.
