import { useStore } from '../store'
import type { VernacularNames } from '../types'
import type { Locale } from '../translations/locale'

// Overlays the vernacular name (keyed by species_binomial) for the given
// locale onto API results, so every downstream consumer (map tooltips,
// panels, favourites, search) sees the resolved name without having to know
// about vernacularNames itself. Falls back to Dutch when the locale has no
// translation for a species.
export function resolveVernacularNames<T extends { species_binomial: string | null; name_vernacular: string | null }>(
  items: T[],
  vernacularNames: VernacularNames,
  locale: Locale,
): T[] {
  return items.map((item) => {
    const key = item.species_binomial?.toUpperCase()
    const entry = key ? vernacularNames[key] : undefined
    const name = entry?.[locale] ?? entry?.nl
    return name ? { ...item, name_vernacular: name } : item
  })
}

// Convenience wrapper for call sites (data fetches) that just want the
// current locale from the store.
export function applyVernacularNames<T extends { species_binomial: string | null; name_vernacular: string | null }>(
  items: T[],
): T[] {
  const { vernacularNames, locale } = useStore.getState()
  return resolveVernacularNames(items, vernacularNames, locale)
}
