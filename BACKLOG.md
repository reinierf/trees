# Backlog

Nice-to-have improvements to pick up later.

- [ ] Data issue: Den Haag trees have height for diameter
- [ ] Filter on species from fav list entry/details
- [ ] Dutch name overrides (on api level?). Same for other data issue overrides.
- [ ] Filters + zoeken
- [ ] Somehow show selected tree if below popup
- [ ] Prune fields in fetcher
- [ ] Have tree images in the TreeDetailPanel: tree, leaf, bark, optionally: fruit/flower
- [ ] Localisation? Propose a way to obtain and use common names in other languages (using INaturalist V1 api vs DwC-A export)

## UI / Components

- [ ] **PanelHeader component** — `SpeciesListPanel` and `FavouritesPanel` share an identical header shell (`flex items-center justify-between px-4 py-3` wrapper + `flex items-center gap-2` right-side button group). Extract into a shared `PanelHeader` component in `InfoPopup.tsx` or a new file. `TreeDetailPanel` differs enough (different padding, button title, second row) to leave untouched.
