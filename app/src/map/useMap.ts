import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { MapController } from './MapController'
import { TileCache } from './tileCache'
import { fetchTrees } from '../api/trees'
import { useStore } from '../store'
import { DEBOUNCE_MS, MAX_VIEWPORT_DEG2, MIN_FETCH_ZOOM } from '../config'
import type { Bbox } from '../types'

const POSITION_KEY = 'map-position'
const POSITION_TTL = 86_400_000 // 1 day

function loadSavedPosition(): { center: [number, number]; zoom: number } | null {
  try {
    const raw = localStorage.getItem(POSITION_KEY)
    if (!raw) return null
    const { lat, lon, zoom, savedAt } = JSON.parse(raw)
    if (Date.now() - savedAt > POSITION_TTL) return null
    return { center: [lat as number, lon as number], zoom: zoom as number }
  } catch {
    return null
  }
}

function savePosition(center: [number, number], zoom: number): void {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify({ lat: center[0], lon: center[1], zoom, savedAt: Date.now() }))
  } catch {}
}

export function useMap(containerRef: RefObject<HTMLDivElement | null>) {
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
        const trees = await fetchTrees(bboxes, signal)
        cache.storeFetchResult(missing, trees)
        setVisibleTrees(cache.getVisibleTrees(bounds))
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.error('fetch trees failed', e)
      } finally {
        setIsLoading(false)
      }
    }

    const saved = loadSavedPosition()
    const controller = new MapController({
      onMoveEnd: (bounds, zoom, center) => {
        setCurrentZoom(zoom)
        setCurrentCenter(center)
        savePosition(center, zoom)
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

    controller.init(el, saved?.center, saved?.zoom)
    controllerRef.current = controller

    return () => {
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
      abortController?.abort()
      controller.destroy()
      controllerRef.current = null
    }
  }, [setSelectedTree, setSelectedSpecies, setVisibleTrees, setIsLoading, setTooZoomedOut, setCurrentZoom, setCurrentCenter])

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
