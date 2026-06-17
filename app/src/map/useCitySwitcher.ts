import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MIN_CITY_SWITCH_ZOOM } from '../config'
import { savePosition } from './positionStorage'
import type { City } from '../types'

export function useCitySwitcher(city: City, cities: City[]) {
  const navigate = useNavigate()

  return useCallback((center: [number, number], zoom: number): boolean => {
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
    navigate(`/${target.id}`)
    return true
  }, [city, cities, navigate])
}
