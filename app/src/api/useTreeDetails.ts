import { useEffect, useState } from 'react'
import { fetchTreeDetails, fetchTreesDetails } from './trees'
import { MAX_DETAILS_PER_REQUEST } from '../config'
import { treeKey } from '../lib/treeKey'
import type { Tree, TreeDetails } from '../types'

// Details never change within a build; a session-wide cache makes re-opening a tree instant.
const cache = new Map<string, TreeDetails | null>()

/** Details of one tree: undefined while loading, null if the tree wasn't found. */
export function useTreeDetails(tree: Tree | null): TreeDetails | null | undefined {
  const key = tree ? treeKey(tree) : null
  const [, rerender] = useState(0)

  useEffect(() => {
    if (!tree || !key || cache.has(key)) return
    const controller = new AbortController()
    fetchTreeDetails(tree.source, tree.id, controller.signal)
      .then((d) => { cache.set(key, d); rerender((n) => n + 1) })
      .catch((e) => {
        if ((e as Error).name === 'AbortError') return
        console.error('fetch tree details failed', e)
        cache.set(key, null)
        rerender((n) => n + 1)
      })
    return () => controller.abort()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return key ? cache.get(key) : null
}

/** Details of several trees, filled in batch by batch; rows can render before it completes. */
export function useTreesDetails(trees: Tree[]): Map<string, TreeDetails> {
  const [, rerender] = useState(0)
  const keys = trees.map(treeKey)
  const signature = keys.join('|')

  useEffect(() => {
    const missing = trees.filter((t) => !cache.has(treeKey(t)))
    if (missing.length === 0) return
    const controller = new AbortController()
    void (async () => {
      for (let i = 0; i < missing.length; i += MAX_DETAILS_PER_REQUEST) {
        const chunk = missing.slice(i, i + MAX_DETAILS_PER_REQUEST)
        try {
          const rows = await fetchTreesDetails(chunk.map((t) => [t.source, t.id]), controller.signal)
          for (const d of rows) cache.set(treeKey(d), d)
          for (const t of chunk) if (!cache.has(treeKey(t))) cache.set(treeKey(t), null)
          rerender((n) => n + 1)
        } catch (e) {
          if ((e as Error).name !== 'AbortError') console.error('fetch tree details failed', e)
          return
        }
      }
    })()
    return () => controller.abort()
  }, [signature]) // eslint-disable-line react-hooks/exhaustive-deps

  const result = new Map<string, TreeDetails>()
  for (const key of keys) {
    const d = cache.get(key)
    if (d) result.set(key, d)
  }
  return result
}
