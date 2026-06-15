# Backlog

Nice-to-have improvements to pick up later.

- [ ] Data issue: Den Haag trees have very large values for diameter. Maybe not meters? E.g: https://boxofchocolates.nl/bomen/#/den-haag?tree=130&lat=52.0764067&lon=4.2943064
- [ ] Dutch name overrides (on api level?). Same for other data issue overrides.
- [ ] Filters + zoeken
- [ ] Somehow show selected tree if behind popup (or indicate that is behind)
- [ ] Prune unused fields in fetcher and dbs
- [ ] Localisation of UI: implement i18next. 

## UI / Components

- [ ] **PanelHeader component** — `SpeciesListPanel` and `FavouritesPanel` share an identical header shell (`flex items-center justify-between px-4 py-3` wrapper + `flex items-center gap-2` right-side button group). Extract into a shared `PanelHeader` component in `InfoPopup.tsx` or a new file. `TreeDetailPanel` differs enough (different padding, button title, second row) to leave untouched.
