const POSITION_TTL = 86_400_000 // 1 day

export function loadSavedPosition(cityId: string): { center: [number, number]; zoom: number } | null {
  try {
    const raw = localStorage.getItem(`map-position-${cityId}`)
    if (!raw) return null
    const { lat, lon, zoom, savedAt } = JSON.parse(raw)
    if (Date.now() - savedAt > POSITION_TTL) return null
    return { center: [lat as number, lon as number], zoom: zoom as number }
  } catch {
    return null
  }
}

export function savePosition(cityId: string, center: [number, number], zoom: number): void {
  try {
    localStorage.setItem(
      `map-position-${cityId}`,
      JSON.stringify({ lat: center[0], lon: center[1], zoom, savedAt: Date.now() }),
    )
  } catch {} // eslint-disable-line no-empty
}
