import type { Bbox, Tree } from '../types'
import { CELL_SIZE_DEG, MAX_CACHE_CELLS } from '../config'

function toCellKey(cityId: string, lat: number, lon: number): string {
  return `${cityId}:${Math.floor(lat / CELL_SIZE_DEG)}:${Math.floor(lon / CELL_SIZE_DEG)}`
}

function bboxToCells(cityId: string, bbox: Bbox): Set<string> {
  const latSIdx = Math.floor(bbox.se.lat / CELL_SIZE_DEG)
  const latNIdx = Math.floor(bbox.nw.lat / CELL_SIZE_DEG)
  const lonWIdx = Math.floor(bbox.nw.lon / CELL_SIZE_DEG)
  const lonEIdx = Math.floor(bbox.se.lon / CELL_SIZE_DEG)

  const cells = new Set<string>()
  for (let lat = latSIdx; lat <= latNIdx; lat++) {
    for (let lon = lonWIdx; lon <= lonEIdx; lon++) {
      cells.add(`${cityId}:${lat}:${lon}`)
    }
  }
  return cells
}

type Span = { s: number; e: number }

function spansSignature(spans: Span[]): string {
  return spans.map((sp) => `${sp.s}-${sp.e}`).join(',')
}

function scanlineMerge(keys: string[]): Bbox[] {
  if (keys.length === 0) return []

  const byRow = new Map<number, number[]>()
  for (const key of keys) {
    // Keys are "cityId:latIdx:lonIdx" — take the last two segments so cityId itself may contain ':' safely
    const parts = key.split(':')
    const lonIdx = Number(parts[parts.length - 1])
    const latIdx = Number(parts[parts.length - 2])
    const arr = byRow.get(latIdx) ?? []
    arr.push(lonIdx)
    byRow.set(latIdx, arr)
  }

  const rowSpans = new Map<number, Span[]>()
  for (const [latIdx, lonIdxs] of byRow) {
    const sorted = lonIdxs.slice().sort((a, b) => a - b)
    const spans: Span[] = []
    let s = sorted[0]
    let e = sorted[0]
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === e + 1) {
        e = sorted[i]
      } else {
        spans.push({ s, e })
        s = sorted[i]
        e = sorted[i]
      }
    }
    spans.push({ s, e })
    rowSpans.set(latIdx, spans)
  }

  const rows = [...rowSpans.keys()].sort((a, b) => a - b)
  const bboxes: Bbox[] = []
  let i = 0

  while (i < rows.length) {
    const latS = rows[i]
    const spans = rowSpans.get(latS)!
    const sig = spansSignature(spans)
    let latE = latS
    let j = i + 1

    while (
      j < rows.length &&
      rows[j] === latE + 1 &&
      spansSignature(rowSpans.get(rows[j])!) === sig
    ) {
      latE = rows[j++]
    }

    for (const { s, e } of spans) {
      bboxes.push({
        nw: { lat: (latE + 1) * CELL_SIZE_DEG, lon: s * CELL_SIZE_DEG },
        se: { lat: latS * CELL_SIZE_DEG, lon: (e + 1) * CELL_SIZE_DEG },
      })
    }
    i = j
  }

  return bboxes
}

export class TileCache {
  private readonly cache = new Map<string, Tree[]>()

  getMissingCells(cityId: string, bbox: Bbox): string[] {
    const cells = bboxToCells(cityId, bbox)
    return [...cells].filter((k) => !this.cache.has(k))
  }

  getVisibleTrees(cityId: string, bbox: Bbox): Tree[] {
    const cells = bboxToCells(cityId, bbox)
    const byId = new Map<string, Tree>()
    for (const key of cells) {
      const trees = this.cache.get(key)
      if (!trees) continue
      // Touch for LRU: move to end of Map insertion order
      this.cache.delete(key)
      this.cache.set(key, trees)
      for (const tree of trees) {
        if (
          tree.lat >= bbox.se.lat && tree.lat <= bbox.nw.lat &&
          tree.lon >= bbox.nw.lon && tree.lon <= bbox.se.lon
        ) {
          byId.set(tree.id, tree)
        }
      }
    }
    return [...byId.values()]
  }

  mergeMissingToBboxes(missingCells: string[]): Bbox[] {
    return scanlineMerge(missingCells)
  }

  storeFetchResult(cityId: string, requestedCells: string[], trees: Tree[]): void {
    // Initialise all requested cells — prevents re-fetching cells that have zero trees
    for (const key of requestedCells) {
      if (!this.cache.has(key)) this.cache.set(key, [])
    }

    // Distribute trees to their cell
    for (const tree of trees) {
      const key = toCellKey(cityId, tree.lat, tree.lon)
      this.cache.get(key)?.push(tree)
    }

    // LRU eviction: Map preserves insertion order; first entry is oldest
    while (this.cache.size > MAX_CACHE_CELLS) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
  }
}
