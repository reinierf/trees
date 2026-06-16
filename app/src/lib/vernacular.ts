import { useStore } from '../store'

// Overlays the curated Dutch vernacular name (keyed by species_binomial) onto
// API results right where they enter the app, so every downstream consumer
// (map tooltips, panels, favourites, search) sees the resolved name without
// having to know about vernacularNames itself.
export function applyVernacularNames<T extends { species_binomial: string | null; name_vernacular: string | null }>(
  items: T[],
): T[] {
  const vernacularNames = useStore.getState().vernacularNames
  return items.map((item) => {
    const key = item.species_binomial?.toUpperCase()
    const nl = key ? vernacularNames[key]?.nl : undefined
    return nl ? { ...item, name_vernacular: nl } : item
  })
}
