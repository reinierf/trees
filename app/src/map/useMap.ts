import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { MapController } from './MapController'
import { TileCache } from './tileCache'
import { useStore } from '../store'
import { DEBOUNCE_MS, MAP_ZOOM, RESTORE_CITY_POSITION } from '../config'
import { loadSavedPosition, savePosition } from './positionStorage'
import { useTreeLoader } from './useTreeLoader'
import { useMapClickHandlers } from './useMapClickHandlers'
import { useCitySwitcher } from './useCitySwitcher'
import type { City } from '../types'

export function useMap(containerRef: RefObject<HTMLDivElement | null>, city: City, cities: City[]) {
  const location = useLocation()
  const [, setSearchParams] = useSearchParams()
  const controllerRef = useRef<MapController | null>(null)
  const tileCacheRef = useRef(new TileCache())
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const closePopup = useStore((s) => s.closePopup)
  const setVisibleTrees = useStore((s) => s.setVisibleTrees)
  const setCurrentZoom = useStore((s) => s.setCurrentZoom)
  const setCurrentCenter = useStore((s) => s.setCurrentCenter)
  const visibleTrees = useStore((s) => s.visibleTrees)
  const popupView = useStore((s) => s.popupView)

  const { load: loadTrees, abort: abortLoad } = useTreeLoader(city.id, tileCacheRef.current)
  const { onMapClick, onMarkerClick } = useMapClickHandlers()
  const checkCitySwitch = useCitySwitcher(city, cities)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Read fly-to coords passed via URL when location button switches city
    const hash = window.location.hash
    const qIdx = hash.indexOf('?')
    let flyTarget: { lat: number; lon: number } | null = null
    if (qIdx !== -1) {
      const params = new URLSearchParams(hash.slice(qIdx))
      const lat = parseFloat(params.get('lat') ?? '')
      const lon = parseFloat(params.get('lon') ?? '')
      if (!isNaN(lat) && !isNaN(lon)) flyTarget = { lat, lon }
    }

    // fromPicker is true only when CityButton triggered this navigation.
    // Clear it from history immediately so a page reload gets normal (saved) behavior.
    const fromPicker = (location.state as { fromPicker?: boolean } | null)?.fromPicker === true
    if (fromPicker) window.history.replaceState({ ...window.history.state, usr: null }, '')

    const useSaved = fromPicker ? RESTORE_CITY_POSITION : true
    const rawSaved = useSaved ? loadSavedPosition(city.id) : null
    const saved =
      rawSaved &&
      rawSaved.center[0] >= city.bbox.s && rawSaved.center[0] <= city.bbox.n &&
      rawSaved.center[1] >= city.bbox.w && rawSaved.center[1] <= city.bbox.e
        ? rawSaved
        : null

    const controller = new MapController({
      onMoveEnd: (bounds, zoom, center) => {
        setCurrentZoom(zoom)
        setCurrentCenter(center)

        if (checkCitySwitch(center, zoom)) return

        const [lat, lon] = center
        if (
          lat >= city.bbox.s && lat <= city.bbox.n &&
          lon >= city.bbox.w && lon <= city.bbox.e
        ) savePosition(city.id, center, zoom)

        if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
        moveTimerRef.current = setTimeout(() => loadTrees(bounds, zoom), DEBOUNCE_MS)
      },
      onMapClick,
      onMarkerClick,
    })

    controller.init(el, saved?.center ?? city.center, saved?.zoom ?? MAP_ZOOM)
    controllerRef.current = controller

    if (flyTarget) {
      controller.flyToLocation(flyTarget.lat, flyTarget.lon)
      controller.setLocationMarker(flyTarget.lat, flyTarget.lon)
      setSearchParams({}, { replace: true })
    }

    return () => {
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
      abortLoad()
      controller.destroy()
      controllerRef.current = null
      closePopup()
      setVisibleTrees([])
    }
  }, [city, checkCitySwitch, loadTrees, abortLoad, onMapClick, onMarkerClick, location, setSearchParams, closePopup, setVisibleTrees, setCurrentZoom, setCurrentCenter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    controllerRef.current?.setTrees(visibleTrees)
  }, [visibleTrees])

  useEffect(() => {
    const pv = popupView
    const tree = pv?.kind === 'tree-detail' ? pv.tree : null
    const species =
      pv?.kind === 'tree-detail' ? pv.tree.species_binomial :
      pv?.kind === 'species-detail' ? pv.species : null
    controllerRef.current?.highlightTree(tree)
    controllerRef.current?.highlightSpecies(species)
  }, [popupView])

  return controllerRef
}
