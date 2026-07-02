import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMap } from '../map/useMap'
import { useDebugMode } from '../map/useDebugMode'
import { useStore } from '../store'
import { MIN_FETCH_ZOOM, CLUSTER_DISABLE_ZOOM, MIN_CITY_SWITCH_ZOOM, NL_CENTER, NL_ZOOM } from '../config'
import { fetchCitySpecies, fetchTreesBySpecies, fetchIssues } from '../api/trees'
import { applyVernacularNames } from '../lib/vernacular'
import { zoomForAccuracy } from '../lib/utils'
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
import { IssuesButton } from './IssuesButton'
import { CityInfoButton } from './CityInfoButton'
import type { City } from '../types'

interface Props {
  city: City | null
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
  const setIssues = useStore((s) => s.setIssues)
  useDebugMode()

  useEffect(() => {
    if (!debugMode) return
    fetchIssues().then(({ trees, species }) => setIssues(trees, species)).catch(console.error)
  }, [debugMode, setIssues])

  const pendingSearch    = useStore((s) => s.pendingSearch)
  const setPendingSearch = useStore((s) => s.setPendingSearch)
  const pendingSpeciesSelect    = useStore((s) => s.pendingSpeciesSelect)
  const setPendingSpeciesSelect = useStore((s) => s.setPendingSpeciesSelect)

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchInitialQuery, setSearchInitialQuery] = useState<string | undefined>(undefined)
  const speciesAbortRef = useRef<AbortController | null>(null)

  // Reset search state when city changes
  useEffect(() => {
    setSearchOpen(false)
    setSearchInitialQuery(undefined)
  }, [city?.id])

  useEffect(() => {
    if (pendingSearch !== null) {
      setSearchInitialQuery(pendingSearch)
      setPendingSearch(null)
      setSearchOpen(true)
    }
  }, [pendingSearch, setPendingSearch])

  // Fetch species roster for the city once it changes; also clears any filter from the previous city
  useEffect(() => {
    clearSpeciesFilter()
    if (!city) return
    fetchCitySpecies(city.id).then((species) => setCitySpecies(applyVernacularNames(species))).catch(console.error)
  }, [city?.id, setCitySpecies, clearSpeciesFilter])

  const handleSpeciesSelect = useCallback(async (speciesBinomial: string) => {
    if (!city) return
    setSearchOpen(false)
    setIsLoadingSpeciesFilter(true)

    speciesAbortRef.current?.abort()
    speciesAbortRef.current = new AbortController()

    try {
      const trees = applyVernacularNames(await fetchTreesBySpecies(
        city.id,
        speciesBinomial,
        city.bbox,
        speciesAbortRef.current.signal,
      ))
      setSpeciesFilter(speciesBinomial, trees)
      controllerRef.current?.fitTrees(trees)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('Failed to fetch species trees', e)
        setIsLoadingSpeciesFilter(false)
      }
    }
  }, [city, setIsLoadingSpeciesFilter, setSpeciesFilter, controllerRef])

  useEffect(() => {
    if (pendingSpeciesSelect !== null) {
      setPendingSpeciesSelect(null)
      handleSpeciesSelect(pendingSpeciesSelect)
    }
  }, [pendingSpeciesSelect, setPendingSpeciesSelect, handleSpeciesSelect])

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

  function handleLocate(lat: number, lon: number, accuracy: number) {
    const pickedCityId = pickCity(lat, lon, cities)
    if (!city || pickedCityId !== city.id) {
      navigate(`/${pickedCityId}?lat=${lat.toFixed(7)}&lon=${lon.toFixed(7)}`)
    } else {
      controllerRef.current?.flyToLocation(lat, lon, zoomForAccuracy(accuracy))
      controllerRef.current?.setLocationMarker(lat, lon)
    }
  }

  // City markers are visible at zoom <= MIN_CITY_SWITCH_ZOOM; treat zoom=0 (pre-init) as city mode
  const showingCityMarkers = !city || (currentZoom > 0 && currentZoom <= MIN_CITY_SWITCH_ZOOM)

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {showingCityMarkers && (
        <div className="absolute inset-x-0 top-4 flex justify-center pointer-events-none z-[1000]">
          <div className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-md text-sm text-muted-foreground">
            Kies een plaats om bomen te verkennen
          </div>
        </div>
      )}
      {!showingCityMarkers && tooZoomedOut && !speciesFilter && (
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
      {!showingCityMarkers && <SpeciesFilterBadge onClear={handleClearFilter} />}
      <FullscreenButton />
      <LayerButton onSwitch={(url, attribution, maxZoom) => controllerRef.current?.switchTileLayer(url, attribution, maxZoom)} />
      <CityButton
        city={city}
        cities={cities}
        onCurrentCity={city ? () => controllerRef.current?.panTo(city.center[0], city.center[1]) : undefined}
        onOverview={!city ? () => controllerRef.current?.flyToLocation(NL_CENTER[0], NL_CENTER[1], NL_ZOOM) : undefined}
      />
      {!showingCityMarkers && <SpeciesButton />}
      {!showingCityMarkers && (
        <SearchButton
          onClick={() => setSearchOpen((o) => !o)}
          active={searchOpen || speciesFilter !== null}
        />
      )}
      {!showingCityMarkers && <FavouritesButton />}
      {!showingCityMarkers && <IssuesButton />}
      {!showingCityMarkers && <CityInfoButton />}
      {searchOpen && (
        <SearchOverlay
          onSelect={handleSpeciesSelect}
          initialQuery={searchInitialQuery}
          onClose={() => { setSearchOpen(false); setSearchInitialQuery(undefined) }}
        />
      )}
      <LocationButton onLocate={handleLocate} />
    </div>
  )
}
