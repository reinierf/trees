import type { Bbox, Tree } from '../types'
import { API_BASE, API_LIMIT } from '../config'

export async function fetchTrees(bboxes: Bbox[], signal?: AbortSignal): Promise<Tree[]> {
  const response = await fetch(`${API_BASE}/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bboxes: bboxes.map((b) => ({
        s: b.se.lat,
        n: b.nw.lat,
        w: b.nw.lon,
        e: b.se.lon,
      })),
      limit: API_LIMIT,
    }),
    signal,
  })

  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<Tree[]>
}
