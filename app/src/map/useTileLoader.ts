import { useCallback, useRef } from 'react'
import { fetchMeta, fetchTiles } from '../api/trees'
import { MAX_TILES_PER_REQUEST, MIN_MAP_ZOOM } from '../config'
import { useStore } from '../store'
import { inBounds, tileRange, tilesIn } from './mercator'
import type { TileCache } from './tileCache'
import type { Bbox, Cluster, TilePayload, Tree } from '../types'

/**
 * Loads the 256 px tiles covering the viewport at the current zoom — from the cache where
 * possible, the rest in one batched request — and publishes what's in view to the store:
 * individual trees, server clusters, and per-source/total counts.
 */
export function useTileLoader(cache: TileCache) {
  const abortRef = useRef<AbortController | null>(null)
  const generationRef = useRef(0)

  const load = useCallback(async (bounds: Bbox, zoom: number) => {
    const state = useStore.getState()
    const meta = state.meta
    if (!meta) return
    const z = Math.max(MIN_MAP_ZOOM, Math.round(zoom))
    const filter = state.speciesFilter
    const range = tileRange(bounds, z)
    const tiles = tilesIn(range)
    const generation = ++generationRef.current

    const missing = tiles.filter(([x, y]) => !cache.get(meta.version, filter, z, x, y))
    if (missing.length === 0) {
      // Everything cached: a request still in flight is for a view that's gone.
      abortRef.current?.abort()
      state.setIsLoading(false)
    } else {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      state.setIsLoading(true)
      try {
        const chunks: [number, number][][] = []
        for (let i = 0; i < missing.length; i += MAX_TILES_PER_REQUEST) chunks.push(missing.slice(i, i + MAX_TILES_PER_REQUEST))
        const responses = await Promise.all(chunks.map((c) => fetchTiles(z, c, filter, controller.signal)))
        if (responses.some((r) => r.version !== meta.version)) {
          // The data was rebuilt since this session loaded its species dictionary: ids may have
          // changed, so reload the dictionary; setMeta clears the cache and the map reloads.
          useStore.getState().setMeta(await fetchMeta())
          return
        }
        for (const r of responses) {
          for (const t of r.tiles) cache.set(meta.version, filter, z, t.x, t.y, t.payload)
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.error('fetch tiles failed', e)
        return
      } finally {
        if (generation === generationRef.current) useStore.getState().setIsLoading(false)
      }
    }
    if (generation !== generationRef.current) return

    const visibleTrees: Tree[] = []
    const clusters: Cluster[] = []
    const sourcesInView: Record<string, number> = {}
    let countInView = 0
    let allTreeMode = true
    for (const [x, y] of tiles) {
      const payload: TilePayload | undefined = cache.get(meta.version, filter, z, x, y)
      if (!payload) continue
      countInView += payload.count
      for (const [source, n] of Object.entries(payload.sources)) sourcesInView[source] = (sourcesInView[source] ?? 0) + n
      if (payload.clusters) {
        allTreeMode = false
        clusters.push(...payload.clusters)
      }
      if (payload.trees) {
        for (const t of payload.trees) if (inBounds(t.lat, t.lon, bounds)) visibleTrees.push(t)
      }
    }
    useStore.getState().setView({ visibleTrees, clusters, sourcesInView, countInView, allTreeMode, range })
  }, [cache])

  const abort = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { load, abort }
}
