import type { Tree } from '../types'
import { loadPreference, savePreference } from './preferencesStorage'

// v2: flat map keyed by "source:id"; the city-keyed v1 ('tree-favourites') is no longer read.
const FAVOURITES_KEY = 'tree-favourites-v2'

/** A favourite keeps the fields its list row shows, so the panel needs no details request. */
export interface FavouriteTree extends Tree {
  street: string | null
  year_planted: string | null
  addedAt: number
}

export type Favourites = Record<string, FavouriteTree>

export function loadFavourites(): Favourites {
  return loadPreference<Favourites>(FAVOURITES_KEY, {})
}

export function saveFavourites(favs: Favourites): void {
  savePreference(FAVOURITES_KEY, favs)
}
