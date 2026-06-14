# vernacular/nl — Dutch vernacular names

Builds `vernacular-nl.db`: a curated Dutch common-name lookup for all tree species, used by the PHP API as the high-priority override layer above the iNaturalist base (`vernacular-base.db`).

## Schema

```sql
species_binomial    TEXT PRIMARY KEY
name_vernacular     TEXT NOT NULL
name_vernacular_alt TEXT          -- genuine alternative name (e.g. Bomenbieb disagrees with Wikipedia)
source              TEXT          -- 'wikipedia' | 'bomenbieb' | 'databases'
```

## Building

```
npm run merge-vernacular-nl
```

Fetches Wikipedia and Bomenbieb on first run and caches results in `sources/`. Subsequent runs use the cache. Add `--no-cache` to re-fetch.

```
npm run merge-vernacular-nl -- --no-cache
```

## Source priority

1. **Wikipedia** (`nl.wikipedia.org/wiki/Lijst_van_boomsoorten_in_Nederland`) — curated reference, ~184 species. Provides the canonical Dutch name. When Bomenbieb disagrees the Bomenbieb name is stored as `name_vernacular_alt`.
2. **Bomenbieb** (`bomenbieb.nl/alle-boomsoorten`) — professional arborist catalogue, ~290 species-level entries (cultivar entries filtered out). Used for species not covered by Wikipedia.
3. **Database votes** — majority vote across city databases (Amsterdam, Den Haag, Groningen, Rotterdam) with spelling normalisation and genus-placeholder detection. Fallback for ~482 species not in either web source.

## Investigated sources — not added

**bomengids.nl/bomen.html**
Flat list of ~237 North-European species. Not added because:
- 207 of 237 entries are already covered.
- The remaining 30 "new" entries are almost all scientific name typos (`GINKO BILOBA`, `MENZOIESII`, `LEAVIGATA`, `SPEATHII`, `ANGUSTIFOLI` truncated, etc.) that don't match our keys rather than genuine new species.
- Data quality too low to trust as a source.

**denieuweoosterbomenpark.nl/alle-bomen**
HTML table from Arboretum De Nieuwe Ooster, ~648 entries. Not added because:
- 195 of the 287 new binomials carry only a single-word genus-level Dutch name ("Esdoorn", "Els", "Hulst") — the same genus-placeholder noise the pipeline already rejects from city databases.
- Only 9 new entries have a genuinely specific multi-word Dutch name.
- 27 entries would upgrade an existing genus-placeholder to a specific name (e.g. `AESCULUS CARNEA`: "Paardenkastanje" → "Rode paardenkastanje"), but those species are rare in municipal inventories and don't justify a new source tier.
- The arboretum is a physical collection, not a Dutch naming reference; its labels tend toward genus names for exotic species.
