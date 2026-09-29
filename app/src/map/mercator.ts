import type { Bbox } from '../types'

// Web-mercator tile math, identical to the API's and the build script's so that tile
// indices mean the same thing everywhere.

export const TILE_SIZE = 256

/** World pixel coordinates at zoom z. */
export function worldPx(lat: number, lon: number, z: number): [number, number] {
  const scale = TILE_SIZE * 2 ** z
  const r = (lat * Math.PI) / 180
  return [
    ((lon + 180) / 360) * scale,
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * scale,
  ]
}

export function tileOf(lat: number, lon: number, z: number): [number, number] {
  const [x, y] = worldPx(lat, lon, z)
  return [Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE)]
}

export interface TileRange {
  z: number
  x0: number
  x1: number
  y0: number
  y1: number
}

export function tileRange(bounds: Bbox, z: number): TileRange {
  const max = 2 ** z - 1
  const clamp = (v: number) => Math.min(max, Math.max(0, v))
  const [x0, y0] = tileOf(bounds.nw.lat, bounds.nw.lon, z)
  const [x1, y1] = tileOf(bounds.se.lat, bounds.se.lon, z)
  return { z, x0: clamp(x0), x1: clamp(x1), y0: clamp(y0), y1: clamp(y1) }
}

export function tilesIn(range: TileRange): [number, number][] {
  const tiles: [number, number][] = []
  for (let x = range.x0; x <= range.x1; x++) {
    for (let y = range.y0; y <= range.y1; y++) tiles.push([x, y])
  }
  return tiles
}

export function tileCount(range: TileRange): number {
  return (range.x1 - range.x0 + 1) * (range.y1 - range.y0 + 1)
}

export function inBounds(lat: number, lon: number, bounds: Bbox): boolean {
  return lat <= bounds.nw.lat && lat >= bounds.se.lat && lon >= bounds.nw.lon && lon <= bounds.se.lon
}
