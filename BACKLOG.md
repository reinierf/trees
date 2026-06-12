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
- [x] Tree-flagging: Add a flag button to the treedetailspanel. I want to use this for myself, to note that something is incorrect about the tree data, so a list is created with data issues to fix. Clicking the button should open a modal showing the tree's fields with checkboxes so I can mark which field is incorrect. Also add a text input line and an ok button. Clicking ok should send the tree id, binomial name, dutch name, name and value of checked fields and text input to the backend. Create new api endpoint for this. This data should be appended to a .txt file, along with a date+time string. One line per entry. Suggest a format for this, favoring readability. In the app hid this feature until user has typed 'dbg'. This is the signal to enable debug mode. Maybe more debug/admin features will follow. One in debug mode, stay in debug mode. Also show the debug overlay for current lat/lon and zoom level based on this mode. Debug mode is also enabled using the existing ?dbg search param.
First add the debug mode keystrokes handling. Tie the existing search param handling in with this. Then add the tree-flagging-feature to api. THen to frontend. Commit in between steps.

## UI / Components

- [ ] **PanelHeader component** — `SpeciesListPanel` and `FavouritesPanel` share an identical header shell (`flex items-center justify-between px-4 py-3` wrapper + `flex items-center gap-2` right-side button group). Extract into a shared `PanelHeader` component in `InfoPopup.tsx` or a new file. `TreeDetailPanel` differs enough (different padding, button title, second row) to leave untouched.
