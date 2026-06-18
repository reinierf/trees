import { CITY_MENU_RECENT_COUNT } from '../config'

const KEY = 'recent-cities'

export function loadRecentCityIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    return JSON.parse(raw) as string[]
  } catch {
    return []
  }
}

export function recordCityVisit(cityId: string): void {
  try {
    const prev = loadRecentCityIds().filter((id) => id !== cityId)
    localStorage.setItem(KEY, JSON.stringify([cityId, ...prev].slice(0, CITY_MENU_RECENT_COUNT)))
  } catch {} // eslint-disable-line no-empty
}
