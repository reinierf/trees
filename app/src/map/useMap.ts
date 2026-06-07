import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MapController } from './MapController'
import { TileCache } from './tileCache'
import { fetchTrees } from '../api/trees'
import { useStore } from '../store'
import { DEBOUNCE_MS, MAP_ZOOM, MAX_VIEWPORT_DEG2, MIN_CITY_SWITCH_ZOOM, MIN_FETCH_ZOOM } from '../config'
import type { Bbox, City } from '../types'

const POSITION_TTL = 86_400_000 // 1 day

function loadSavedPosition(cityId: string): { center: [number, number]; zoom: number } | null {
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

function savePosition(cityId: string, center: [number, number], zoom: number): void {
  try {
    localStorage.setItem(
      `map-position-${cityId}`,
      JSON.stringify({ lat: center[0], lon: center[1], zoom, savedAt: Date.now() }),
    )
  } catch {}
}

export function useMap(containerRef: RefObject<HTMLDivElement | null>, city: City, cities: City[]) {
  const navigate = useNavigate()
  const [, setSearchParams] = useSearchParams()
  const controllerRef = useRef<MapController | null>(null)
  const tileCacheRef = useRef(new TileCache())
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setSelectedTree = useStore((s) => s.setSelectedTree)
  const setSelectedSpecies = useStore((s) => s.setSelectedSpecies)
  const setVisibleTrees = useStore((s) => s.setVisibleTrees)
  const setIsLoading = useStore((s) => s.setIsLoading)
  const setTooZoomedOut = useStore((s) => s.setTooZoomedOut)
  const setCurrentZoom = useStore((s) => s.setCurrentZoom)
  const setCurrentCenter = useStore((s) => s.setCurrentCenter)
  const visibleTrees = useStore((s) => s.visibleTrees)
  const selectedSpecies = useStore((s) => s.selectedSpecies)
  const selectedTree = useStore((s) => s.selectedTree)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const cache = tileCacheRef.current
    let abortController: AbortController | null = null

    async function loadTrees(bounds: Bbox, zoom: number) {
      if (zoom < MIN_FETCH_ZOOM) {
        setTooZoomedOut(true)
        setVisibleTrees([])
        return
      }
      setTooZoomedOut(false)

      const area = (bounds.nw.lat - bounds.se.lat) * (bounds.se.lon - bounds.nw.lon)
      if (area > MAX_VIEWPORT_DEG2) return

      const missing = cache.getMissingCells(bounds)

      if (missing.length === 0) {
        setVisibleTrees(cache.getVisibleTrees(bounds))
        return
      }

      abortController?.abort()
      abortController = new AbortController()
      const { signal } = abortController

      setIsLoading(true)
      try {
        const bboxes = cache.mergeMissingToBboxes(missing)
        const trees = await fetchTrees(bboxes, city.id, signal)
        cache.storeFetchResult(missing, trees)
        setVisibleTrees(cache.getVisibleTrees(bounds))
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.error('fetch trees failed', e)
      } finally {
        setIsLoading(false)
      }
    }

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

    const rawSaved = loadSavedPosition(city.id)
    const saved = rawSaved &&
      rawSaved.center[0] >= city.bbox.s && rawSaved.center[0] <= city.bbox.n &&
      rawSaved.center[1] >= city.bbox.w && rawSaved.center[1] <= city.bbox.e
      ? rawSaved : null
    const controller = new MapController({
      onMoveEnd: (bounds, zoom, center) => {
        setCurrentZoom(zoom)
        setCurrentCenter(center)

        if (zoom >= MIN_CITY_SWITCH_ZOOM) {
          const [lat, lon] = center
          const inCurrentCity =
            lat >= city.bbox.s && lat <= city.bbox.n &&
            lon >= city.bbox.w && lon <= city.bbox.e
          if (!inCurrentCity) {
            const target = cities.find(
              (c) => c.id !== city.id &&
                lat >= c.bbox.s && lat <= c.bbox.n &&
                lon >= c.bbox.w && lon <= c.bbox.e,
            )
            if (target) {
              savePosition(target.id, center, zoom)
              navigate(`/${target.id}`)
              return
            }
          }
        }

        savePosition(city.id, center, zoom)

        if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
        moveTimerRef.current = setTimeout(() => loadTrees(bounds, zoom), DEBOUNCE_MS)
      },
      onMapClick: () => {
        setSelectedTree(null)
        setSelectedSpecies(null)
      },
      onMarkerClick: (tree) => {
        const current = useStore.getState().selectedTree
        if (current?.id === tree.id) {
          setSelectedTree(null)
          setSelectedSpecies(null)
        } else {
          setSelectedTree(tree)
          setSelectedSpecies(tree.species_binomial)
        }
      },
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
      abortController?.abort()
      controller.destroy()
      controllerRef.current = null
      // Clear selection state so stale popup doesn't linger on city switch
      setSelectedTree(null)
      setSelectedSpecies(null)
      setVisibleTrees([])
    }
  }, [city, cities, navigate, setSearchParams, setSelectedTree, setSelectedSpecies, setVisibleTrees, setIsLoading, setTooZoomedOut, setCurrentZoom, setCurrentCenter])

  useEffect(() => {
    controllerRef.current?.setTrees(visibleTrees)
  }, [visibleTrees])

  useEffect(() => {
    controllerRef.current?.highlightSpecies(selectedSpecies)
  }, [selectedSpecies])

  useEffect(() => {
    controllerRef.current?.highlightTree(selectedTree)
  }, [selectedTree])

  return controllerRef
}
