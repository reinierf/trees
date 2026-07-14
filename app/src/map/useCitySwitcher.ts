import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MIN_CITY_SWITCH_ZOOM } from '../config'
import { savePosition } from './positionStorage'
import { findSmallestContainingCity } from './cityLookup'
import type { City } from '../types'

export function useCitySwitcher(city: City | null, cities: City[]) {
  const navigate = useNavigate()

  return useCallback((center: [number, number], zoom: number): boolean => {
    if (!city) return false
    if (zoom < MIN_CITY_SWITCH_ZOOM) return false
    const [lat, lon] = center

    // Smallest bbox = most specific coverage. Avoids misdetection when a large city's bbox
    // (e.g. Rotterdam) overlaps a smaller neighbour (e.g. Ridderkerk): the smaller city wins
    // because its tree data most tightly surrounds the current position. Closest-center would
    // also work for these cities, but could misfire if a city center sits near a border.
    const target = findSmallestContainingCity(lat, lon, cities)
    if (!target || target.id === city.id) return false

    savePosition(target.id, center, zoom)
    // autoSwitch: true tells the city-change effect not to fly — user is already there
    navigate(`/${target.id}`, { state: { autoSwitch: true } })
    return true
  }, [city, cities, navigate])
}
