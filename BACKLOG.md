# Backlog

Nice-to-have improvements to pick up later.

- [ ] Fetching binomials and vernaculars still intransparent/messy? Decide what we're interested in: correct/up-to-date binomials or just consistency in binomials
- [ ] Loading indicator / spinner at startup
- [ ] Discuss storing species binomials in scientific format versus current all uppercase. 
- [ ] Fix species names: "SORBUS ‘JOSEPH"
- [ ] Add more places
- [ ] Augment city info (monumental only, multiple sources, other?)
- [ ] Sort species list by name or count
- [ ] Add a settings menu (togglable with a gear icon button) in which user can choose language, choose naming mode. Move the naming mode UI out of the SpeciesList and Favourites list. 
- [ ] Filters: year, genus?
- [ ] Somehow show selected tree if behind popup (or indicate that it is behind)
- [ ] Localisation of UI: implement i18next. 

## UI / Components

- [ ] **PanelHeader component** — `SpeciesListPanel` and `FavouritesPanel` share an identical header shell (`flex items-center justify-between px-4 py-3` wrapper + `flex items-center gap-2` right-side button group). Extract into a shared `PanelHeader` component in `InfoPopup.tsx` or a new file. `TreeDetailPanel` differs enough (different padding, button title, second row) to leave untouched.
