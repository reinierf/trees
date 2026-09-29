import type { TilePayload } from '../types'
import { MAX_CACHE_TILES, MIN_MAP_ZOOM } from '../config'
import { tileOf } from './mercator'

/**
 * LRU cache of /api/tiles payloads, keyed by build version, species filter and z/x/y.
 *
 * A tile the server sent as individual trees holds every tree of its area, so all of its
 * descendant tiles at higher zooms are derived here without a request: zooming in within an
 * area that is already in tree mode costs nothing.
 */
export class TileCache {
  private readonly tiles = new Map<string, TilePayload>()

  private static key(version: string, filter: number | null, z: number, x: number, y: number): string {
    return `${version}|${filter ?? ''}|${z}|${x}|${y}`
  }

  get(version: string, filter: number | null, z: number, x: number, y: number): TilePayload | undefined {
    const key = TileCache.key(version, filter, z, x, y)
    const hit = this.tiles.get(key)
    if (hit) {
      this.tiles.delete(key)
      this.tiles.set(key, hit)
      return hit
    }
    const derived = this.deriveFromAncestor(version, filter, z, x, y)
    if (derived) this.set(version, filter, z, x, y, derived)
    return derived
  }

  set(version: string, filter: number | null, z: number, x: number, y: number, payload: TilePayload): void {
    this.tiles.set(TileCache.key(version, filter, z, x, y), payload)
    while (this.tiles.size > MAX_CACHE_TILES) {
      const oldest = this.tiles.keys().next().value
      if (oldest === undefined) break
      this.tiles.delete(oldest)
    }
  }

  clear(): void {
    this.tiles.clear()
  }

  private deriveFromAncestor(version: string, filter: number | null, z: number, x: number, y: number): TilePayload | undefined {
    for (let k = 1; z - k >= MIN_MAP_ZOOM; k++) {
      const parent = this.tiles.get(TileCache.key(version, filter, z - k, x >> k, y >> k))
      if (!parent) continue
      if (!parent.trees) return undefined  // clusters: finer tiles need the server
      const trees = parent.trees.filter((t) => {
        const [tx, ty] = tileOf(t.lat, t.lon, z)
        return tx === x && ty === y
      })
      const sources: Record<string, number> = {}
      for (const t of trees) sources[t.source] = (sources[t.source] ?? 0) + 1
      return { count: trees.length, sources, clusters: null, trees }
    }
    return undefined
  }
}
