import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MIN_CITY_SWITCH_ZOOM } from '../config'
import { savePosition } from './positionStorage'
import type { City } from '../types'

export function useCitySwitcher(city: City | null, cities: City[]) {
  const navigate = useNavigate()

  return useCallback((center: [number, number], zoom: number): boolean => {
    if (!city) return false
    if (zoom < MIN_CITY_SWITCH_ZOOM) return false
    const [lat, lon] = center

    const matching = cities.filter(
      (c) => c.has_data &&
        lat >= c.bbox.s && lat <= c.bbox.n &&
        lon >= c.bbox.w && lon <= c.bbox.e,
    )
    if (matching.length === 0) return false

    // Smallest bbox = most specific coverage. Avoids misdetection when a large city's bbox
    // (e.g. Rotterdam) overlaps a smaller neighbour (e.g. Ridderkerk): the smaller city wins
    // because its tree data most tightly surrounds the current position. Closest-center would
    // also work for these cities, but could misfire if a city center sits near a border.
    const bboxArea = (c: City) => (c.bbox.n - c.bbox.s) * (c.bbox.e - c.bbox.w)
    const target = matching.reduce((best, c) => bboxArea(c) < bboxArea(best) ? c : best)
    if (target.id === city.id) return false

    savePosition(target.id, center, zoom)
    // autoSwitch: true tells the city-change effect not to fly — user is already there
    navigate(`/${target.id}`, { state: { autoSwitch: true } })
    return true
  }, [city, cities, navigate])
}
