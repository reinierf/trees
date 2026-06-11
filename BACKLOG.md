# Backlog

Nice-to-have improvements to pick up later.

- [ ] Check fetch trees when clearing filter, or keep fetching in fav mode
- [ ] Filter on species from fav list entry/details
- [ ] Dutch name overrides
- [ ] Filters + zoeken
- [ ] Somehow show selected tree if below popup
- [ ] Prune fields in fetcher
- [ ] Have tree images in the TreeDetailPanel: tree, leaf, bark, optionally: fruit/flower
- [ ] Guard api against outside usage
- [ ] Fix build warning: (!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.

## UI / Components

- [ ] **PanelHeader component** — `SpeciesListPanel` and `FavouritesPanel` share an identical header shell (`flex items-center justify-between px-4 py-3` wrapper + `flex items-center gap-2` right-side button group). Extract into a shared `PanelHeader` component in `InfoPopup.tsx` or a new file. `TreeDetailPanel` differs enough (different padding, button title, second row) to leave untouched.
