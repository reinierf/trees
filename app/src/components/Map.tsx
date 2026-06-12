import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMap } from '../map/useMap'
import { useStore } from '../store'
import { MIN_FETCH_ZOOM, CLUSTER_DISABLE_ZOOM, CITY_OVERVIEW_ZOOM } from '../config'
import { fetchCitySpecies, fetchTreesBySpecies } from '../api/trees'
import { SpeciesButton } from './SpeciesButton'
import { CityButton } from './CityButton'
import { LocationButton } from './LocationButton'
import { FullscreenButton } from './FullscreenButton'
import { LoadingSpinner } from './LoadingSpinner'
import { SearchButton } from './SearchButton'
import { SearchOverlay } from './SearchOverlay'
import { SpeciesFilterBadge } from './SpeciesFilterBadge'
import { LayerButton } from './LayerButton'
import { FavouritesButton } from './FavouritesButton'
import type { City } from '../types'

interface Props {
  city: City
  cities: City[]
}

function pickCity(lat: number, lon: number, cities: City[]): string {
  const contained = cities.filter(
    (c) => lat >= c.bbox.s && lat <= c.bbox.n && lon >= c.bbox.w && lon <= c.bbox.e,
  )
  if (contained.length === 1) return contained[0].id
  let nearest = cities[0]
  let minDist = Infinity
  for (const c of cities) {
    const d = Math.hypot(lat - c.center[0], lon - c.center[1])
    if (d < minDist) { minDist = d; nearest = c }
  }
  return nearest.id
}

export function Map({ city, cities }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const controllerRef = useMap(containerRef, city, cities)
  const navigate = useNavigate()
  const tooZoomedOut = useStore((s) => s.tooZoomedOut)
  const isLoading = useStore((s) => s.isLoading)
  const currentZoom = useStore((s) => s.currentZoom)
  const currentCenter = useStore((s) => s.currentCenter)
  const speciesFilter = useStore((s) => s.speciesFilter)
  const setCitySpecies = useStore((s) => s.setCitySpecies)
  const setSpeciesFilter = useStore((s) => s.setSpeciesFilter)
  const clearSpeciesFilter = useStore((s) => s.clearSpeciesFilter)
  const setIsLoadingSpeciesFilter = useStore((s) => s.setIsLoadingSpeciesFilter)
  const setTooZoomedOut = useStore((s) => s.setTooZoomedOut)

  const debugMode = useStore((s) => s.debugMode)
  const setDebugMode = useStore((s) => s.setDebugMode)

  const [searchOpen, setSearchOpen] = useState(false)
  const speciesAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const buf: string[] = []
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.length !== 1) return
      buf.push(e.key.toLowerCase())
      if (buf.length > 3) buf.shift()
      if (buf.join('') === 'dbg') setDebugMode(true)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [setDebugMode])

  // Fetch species roster for the city once on mount; also clears any filter from a previous city
  useEffect(() => {
    clearSpeciesFilter()
    fetchCitySpecies(city.id).then(setCitySpecies).catch(console.error)
  }, [city.id, setCitySpecies, clearSpeciesFilter])

  const handleSpeciesSelect = useCallback(async (speciesBinomial: string) => {
    setSearchOpen(false)
    setIsLoadingSpeciesFilter(true)

    speciesAbortRef.current?.abort()
    speciesAbortRef.current = new AbortController()

    try {
      const trees = await fetchTreesBySpecies(
        city.id,
        speciesBinomial,
        city.bbox,
        speciesAbortRef.current.signal,
      )
      setSpeciesFilter(speciesBinomial, trees)
      controllerRef.current?.flyToLocation(city.center[0], city.center[1], CITY_OVERVIEW_ZOOM)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('Failed to fetch species trees', e)
        setIsLoadingSpeciesFilter(false)
      }
    }
  }, [city, setIsLoadingSpeciesFilter, setSpeciesFilter, controllerRef])

  function handleClearFilter() {
    speciesAbortRef.current?.abort()
    clearSpeciesFilter()
    if (currentZoom < MIN_FETCH_ZOOM) {
      setTooZoomedOut(true)
    }
  }

  const centerStr = currentCenter
    ? `[${currentCenter[0].toFixed(4)}, ${currentCenter[1].toFixed(4)}]`
    : ''

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {tooZoomedOut && !speciesFilter && (
        <div className="absolute inset-x-0 top-2 flex justify-center pointer-events-none z-[1000]">
          <div className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-md text-sm text-muted-foreground">
            Zoom in {Math.ceil(MIN_FETCH_ZOOM - currentZoom)}x to see trees
          </div>
        </div>
      )}
      {isLoading && !tooZoomedOut && (
        <div className="absolute inset-x-0 top-3 flex justify-center pointer-events-none z-[1000]">
          <LoadingSpinner />
        </div>
      )}
      {debugMode && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none z-[1000] font-mono text-xs bg-black/60 text-white px-2 py-1 rounded">
          z{currentZoom} · fetch≥{MIN_FETCH_ZOOM} · solo≥{CLUSTER_DISABLE_ZOOM}{centerStr && ` · ${centerStr}`}
        </div>
      )}
      <SpeciesFilterBadge onClear={handleClearFilter} />
      <FullscreenButton />
      <LayerButton onSwitch={(url, attribution, maxZoom) => controllerRef.current?.switchTileLayer(url, attribution, maxZoom)} />
      <CityButton city={city} cities={cities} onCurrentCity={() => controllerRef.current?.panTo(city.center[0], city.center[1])} />
      <SpeciesButton citiesCount={cities.length} />
      <SearchButton
        citiesCount={cities.length}
        onClick={() => setSearchOpen((o) => !o)}
        active={searchOpen || speciesFilter !== null}
      />
      <FavouritesButton citiesCount={cities.length} />
      <LocationButton onLocate={(lat, lon) => {
        const pickedCityId = pickCity(lat, lon, cities)
        if (pickedCityId !== city.id) {
          navigate(`/${pickedCityId}?lat=${lat.toFixed(7)}&lon=${lon.toFixed(7)}`)
        } else {
          controllerRef.current?.flyToLocation(lat, lon)
          controllerRef.current?.setLocationMarker(lat, lon)
        }
      }} />
      {searchOpen && (
        <SearchOverlay
          onSelect={handleSpeciesSelect}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  )
}
