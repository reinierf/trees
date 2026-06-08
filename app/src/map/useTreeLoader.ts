import { useCallback, useRef } from 'react'
import { fetchTrees } from '../api/trees'
import { useStore } from '../store'
import { MIN_FETCH_ZOOM, MAX_VIEWPORT_DEG2 } from '../config'
import type { TileCache } from './tileCache'
import type { Bbox } from '../types'

export function useTreeLoader(cityId: string, cache: TileCache) {
  const abortControllerRef = useRef<AbortController | null>(null)
  const setIsLoading = useStore((s) => s.setIsLoading)
  const setTooZoomedOut = useStore((s) => s.setTooZoomedOut)
  const setVisibleTrees = useStore((s) => s.setVisibleTrees)

  const load = useCallback(async (bounds: Bbox, zoom: number) => {
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

    abortControllerRef.current?.abort()
    abortControllerRef.current = new AbortController()
    const { signal } = abortControllerRef.current

    setIsLoading(true)
    try {
      const bboxes = cache.mergeMissingToBboxes(missing)
      const trees = await fetchTrees(bboxes, cityId, signal)
      cache.storeFetchResult(missing, trees)
      setVisibleTrees(cache.getVisibleTrees(bounds))
    } catch (e) {
      if ((e as Error).name !== 'AbortError') console.error('fetch trees failed', e)
    } finally {
      setIsLoading(false)
    }
  }, [cityId, cache, setIsLoading, setTooZoomedOut, setVisibleTrees])

  const abort = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  return { load, abort }
}
