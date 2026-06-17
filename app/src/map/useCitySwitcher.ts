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
    const inCurrentCity =
      lat >= city.bbox.s && lat <= city.bbox.n &&
      lon >= city.bbox.w && lon <= city.bbox.e
    if (inCurrentCity) return false

    const target = cities.find(
      (c) => c.id !== city.id &&
        c.has_data &&
        lat >= c.bbox.s && lat <= c.bbox.n &&
        lon >= c.bbox.w && lon <= c.bbox.e,
    )
    if (!target) return false

    savePosition(target.id, center, zoom)
    // autoSwitch: true tells the city-change effect not to fly — user is already there
    navigate(`/${target.id}`, { state: { autoSwitch: true } })
    return true
  }, [city, cities, navigate])
}
