# Backlog

Nice-to-have improvements to pick up later.

- [ ] Fetching binomials and vernaculars still intransparent/messy? Decide what we're interested in: correct/up-to-date binomials or just consistency in binomials and have recognizable names
- [ ] Fix species names: "SORBUS ‘JOSEPH"
- [ ] Add more places
- [ ] Augment city info (monumental only, multiple sources, other?)
- [ ] Sort species list by name or count
- [ ] Add a settings menu (togglable with a gear icon button) in which user can choose language, choose naming mode. Move the naming mode UI out of the SpeciesList and Favourites list. 
- [ ] Filters: year, genus?
- [ ] Somehow show selected tree if behind popup (or indicate that it is behind)
- [ ] Localisation of UI: implement i18next. 

## Arboreta
https://www.botanischetuinen.nl/

Gimborn/Trompenburg/Ten Borgh/De Dennenhorst:
https://www.bomenmuseum.nl/collectie/collectiedatabase/

Shared fetcher client for this database: `open-data-fetcher/lib/collectie-gimborn.js`.

Trompenburg: fetcher built (`open-data-fetcher/cities/trompenburg.js`), data
fetched, but shelved — many specimens share exact-identical coordinates
(positioned per planting-section, not individually surveyed), making the
per-tree map view unusable as-is. Not re-registered in `api/cities.json`.

Bomenmuseum Gimborn: fetcher built (`open-data-fetcher/cities/bomenmuseum-gimborn.js`),
3,169 trees fetched, coordinates look individually granular (unlike
Trompenburg). Live in `api/cities.json`.

Ten Borgh / De Dennenhorst: not yet implemented, same database/protocol —
see `open-data-fetcher/README.md` for the pattern to follow.

Details: `open-data-fetcher/README.md` → "Non-WFS sources: Von Gimborn
Arboretum collection database".

De Nieuwe Ooster:
https://viewer.bomenwacht.nl/?code=DNO1oqxV6qBv