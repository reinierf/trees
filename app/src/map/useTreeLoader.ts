import { useCallback, useEffect, useRef } from 'react'
import { fetchTrees } from '../api/trees'
import { applyVernacularNames } from '../lib/vernacular'
import { useStore } from '../store'
import type { TileCache } from './tileCache'
import type { Bbox } from '../types'

export function useTreeLoader(
  cityId: string,
  minFetchZoom: number,
  maxViewportDeg2: number,
  cache: TileCache,
) {
  const abortControllerRef = useRef<AbortController | null>(null)
  const setIsLoading = useStore((s) => s.setIsLoading)
  const setTooZoomedOut = useStore((s) => s.setTooZoomedOut)
  const setVisibleTrees = useStore((s) => s.setVisibleTrees)
  const speciesFilter = useStore((s) => s.speciesFilter)
  // Ref so the load callback always reads the current value even when captured
  // in a stale closure (e.g. the onMoveEnd handler in MapController).
  const speciesFilterRef = useRef(speciesFilter)
  useEffect(() => { speciesFilterRef.current = speciesFilter }, [speciesFilter])

  const load = useCallback(async (bounds: Bbox, zoom: number) => {
    if (speciesFilterRef.current) return
    if (zoom < minFetchZoom) {
      setTooZoomedOut(true)
      setVisibleTrees([])
      return
    }
    setTooZoomedOut(false)

    const area = (bounds.nw.lat - bounds.se.lat) * (bounds.se.lon - bounds.nw.lon)
    if (area > maxViewportDeg2) return

    const missing = cache.getMissingCells(bounds)
    if (missing.length === 0) {
      setVisibleTrees(cache.getVisibleTrees(bounds))
      return
    }

    abortControllerRef.current?.abort()
    abortControllerRef.current = new AbortController()
    const { signal } = abortControllerRef.current

    setIsLoading(true)
    try {
      const bboxes = cache.mergeMissingToBboxes(missing)
      const trees = await fetchTrees(bboxes, cityId, signal)
      cache.storeFetchResult(missing, applyVernacularNames(trees))
      setVisibleTrees(cache.getVisibleTrees(bounds))
    } catch (e) {
      if ((e as Error).name !== 'AbortError') console.error('fetch trees failed', e)
    } finally {
      setIsLoading(false)
    }
  }, [cityId, minFetchZoom, maxViewportDeg2, cache, setIsLoading, setTooZoomedOut, setVisibleTrees])

  const abort = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  return { load, abort }
}
