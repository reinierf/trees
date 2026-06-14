# Backlog

Nice-to-have improvements to pick up later.

- [ ] Filter on species from fav list entry/details
- [ ] Dutch name overrides
- [ ] Filters + zoeken
- [ ] Somehow show selected tree if below popup
- [ ] Prune fields in fetcher
- [ ] Have tree images in the TreeDetailPanel: tree, leaf, bark, optionally: fruit/flower
- [ ] Guard api against outside usage

## UI / Components

- [ ] **PanelHeader component** — `SpeciesListPanel` and `FavouritesPanel` share an identical header shell (`flex items-center justify-between px-4 py-3` wrapper + `flex items-center gap-2` right-side button group). Extract into a shared `PanelHeader` component in `InfoPopup.tsx` or a new file. `TreeDetailPanel` differs enough (different padding, button title, second row) to leave untouched.
