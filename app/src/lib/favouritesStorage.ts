import type { Tree } from '../types'
import { loadPreference, savePreference } from './preferencesStorage'

const FAVOURITES_KEY = 'tree-favourites'
export type Favourites = Record<string, Tree[]>

export function loadFavourites(): Favourites {
  return loadPreference<Favourites>(FAVOURITES_KEY, {})
}

export function saveFavourites(favs: Favourites): void {
  savePreference(FAVOURITES_KEY, favs)
}
