import type { City } from '../types'

/** Smallest-bbox-area city among those with data whose bbox contains the given point, or null if none does. */
export function findSmallestContainingCity(lat: number, lon: number, cities: City[]): City | null {
  const matching = cities.filter(
    (c) => c.has_data &&
      lat >= c.bbox.s && lat <= c.bbox.n &&
      lon >= c.bbox.w && lon <= c.bbox.e,
  )
  if (matching.length === 0) return null

  const bboxArea = (c: City) => (c.bbox.n - c.bbox.s) * (c.bbox.e - c.bbox.w)
  return matching.reduce((best, c) => bboxArea(c) < bboxArea(best) ? c : best)
}
