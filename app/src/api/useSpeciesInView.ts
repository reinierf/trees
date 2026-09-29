import { useEffect, useMemo, useState } from 'react'
import { fetchSpeciesInRange } from './trees'
import { DEBOUNCE_MS, MAX_SPECIES_TILES } from '../config'
import { useStore } from '../store'
import { tileCount } from '../map/mercator'

export interface SpeciesCount {
  speciesId: number
  count: number
}

/**
 * Species in the current view with their tree counts, or null before the first load.
 * Where every tile in view holds individual trees the list is counted from those trees
 * (exact, no request); otherwise it comes from the API's per-tile species counts, using tiles
 * one zoom finer than the map so the counted area hugs the viewport more closely.
 */
export function useSpeciesInView(enabled: boolean): SpeciesCount[] | null {
  const allTreeMode = useStore((s) => s.allTreeMode)
  const visibleTrees = useStore((s) => s.visibleTrees)
  const range = useStore((s) => s.range)
  const version = useStore((s) => s.meta?.version)
  const [remote, setRemote] = useState<{ rangeKey: string; list: SpeciesCount[] } | null>(null)

  const local = useMemo(() => {
    if (!enabled || !allTreeMode) return null
    const counts = new Map<number, number>()
    for (const t of visibleTrees) counts.set(t.speciesId, (counts.get(t.speciesId) ?? 0) + 1)
    return [...counts].map(([speciesId, count]) => ({ speciesId, count })).sort((a, b) => b.count - a.count)
  }, [enabled, allTreeMode, visibleTrees])

  const finer = useMemo(() => {
    const fine = { z: range.z + 1, x0: range.x0 * 2, x1: range.x1 * 2 + 1, y0: range.y0 * 2, y1: range.y1 * 2 + 1 }
    return tileCount(fine) <= MAX_SPECIES_TILES ? fine : range
  }, [range])
  const rangeKey = `${version}|${finer.z}|${finer.x0}|${finer.x1}|${finer.y0}|${finer.y1}`

  useEffect(() => {
    if (!enabled || allTreeMode || finer.x1 < finer.x0 || tileCount(finer) > MAX_SPECIES_TILES) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetchSpeciesInRange(finer.z, finer.x0, finer.x1, finer.y0, finer.y1, controller.signal)
        .then((rows) => setRemote({ rangeKey, list: rows.map(([speciesId, count]) => ({ speciesId, count })) }))
        .catch((e) => { if ((e as Error).name !== 'AbortError') console.error('fetch species failed', e) })
    }, DEBOUNCE_MS)
    return () => { clearTimeout(timer); controller.abort() }
  }, [enabled, allTreeMode, rangeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled) return null
  if (allTreeMode) return local
  // While a new range loads, keep showing the previous list rather than flashing "loading".
  return remote?.list ?? null
}
