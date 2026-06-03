import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { MapController } from './MapController'
import { TileCache } from './tileCache'
import { fetchTrees } from '../api/trees'
import { useStore } from '../store'
import { DEBOUNCE_MS, MAX_VIEWPORT_DEG2, MIN_FETCH_ZOOM } from '../config'
import type { Bbox } from '../types'

export function useMap(containerRef: RefObject<HTMLDivElement | null>) {
  const controllerRef = useRef<MapController | null>(null)
  const tileCacheRef = useRef(new TileCache())
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setSelectedTree = useStore((s) => s.setSelectedTree)
  const setSelectedSpecies = useStore((s) => s.setSelectedSpecies)
  const setVisibleTrees = useStore((s) => s.setVisibleTrees)
  const setIsLoading = useStore((s) => s.setIsLoading)
  const setTooZoomedOut = useStore((s) => s.setTooZoomedOut)
  const visibleTrees = useStore((s) => s.visibleTrees)
  const selectedSpecies = useStore((s) => s.selectedSpecies)

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

    const controller = new MapController({
      onMoveEnd: (bounds, zoom) => {
        if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
        moveTimerRef.current = setTimeout(() => loadTrees(bounds, zoom), DEBOUNCE_MS)
      },
      onMarkerClick: (tree) => {
        setSelectedTree(tree)
        setSelectedSpecies(tree.species_binomial)
      },
    })

    controller.init(el)
    controllerRef.current = controller

    return () => {
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
      abortController?.abort()
      controller.destroy()
      controllerRef.current = null
    }
  }, [setSelectedTree, setSelectedSpecies, setVisibleTrees, setIsLoading, setTooZoomedOut])

  useEffect(() => {
    controllerRef.current?.setTrees(visibleTrees)
  }, [visibleTrees])

  useEffect(() => {
    controllerRef.current?.highlightSpecies(selectedSpecies)
  }, [selectedSpecies])

  return controllerRef
}
