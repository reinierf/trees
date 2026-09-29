import type { Meta, Source, SpeciesEntry, TilePayload, Tree, TreeDetails, TreeIssue, SpeciesIssue, LocalizedNames } from '../types'
import { API_BASE } from '../config'

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init)
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<T>
}

function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return getJson<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
}

type RawMeta = {
  version: string
  sources: Source[]
  species: [number, string, string | null, LocalizedNames][]
}

export async function fetchMeta(): Promise<Meta> {
  const raw = await getJson<RawMeta>('/meta')
  const species: SpeciesEntry[] = raw.species.map(([id, key, binomial, names]) => ({ id, key, binomial, names }))
  return { version: raw.version, sources: raw.sources, species }
}

type RawTile = {
  x: number
  y: number
  count: number
  sources: Record<string, number>
  clusters?: [number, number, number][]
  trees?: Record<string, [string, number, number, number][]>
}

export interface TilesResponse {
  version: string
  tiles: Array<{ x: number; y: number; payload: TilePayload }>
}

export async function fetchTiles(
  z: number,
  tiles: [number, number][],
  species: number | null,
  signal?: AbortSignal,
): Promise<TilesResponse> {
  const raw = await postJson<{ version: string; tiles: RawTile[] }>(
    '/tiles',
    species === null ? { z, tiles } : { z, tiles, species },
    signal,
  )
  return {
    version: raw.version,
    tiles: raw.tiles.map((t) => {
      let trees: Tree[] | null = null
      if (t.trees) {
        trees = []
        for (const [source, rows] of Object.entries(t.trees)) {
          for (const [id, lat, lon, speciesId] of rows) trees.push({ source, id, lat, lon, speciesId })
        }
      }
      return {
        x: t.x,
        y: t.y,
        payload: {
          count: t.count,
          sources: t.sources,
          clusters: t.clusters ? t.clusters.map(([lat, lon, count]) => ({ lat, lon, count })) : null,
          trees,
        },
      }
    }),
  }
}

/** Species counts for a tile range, most common first: [speciesId, count]. */
export function fetchSpeciesInRange(
  z: number, x0: number, x1: number, y0: number, y1: number, signal?: AbortSignal,
): Promise<[number, number][]> {
  return getJson(`/species?z=${z}&x0=${x0}&x1=${x1}&y0=${y0}&y1=${y1}`, { signal })
}

export function fetchTreeDetails(source: string, id: string, signal?: AbortSignal): Promise<TreeDetails> {
  return getJson(`/tree?source=${encodeURIComponent(source)}&id=${encodeURIComponent(id)}`, { signal })
}

export function fetchTreesDetails(keys: [string, string][], signal?: AbortSignal): Promise<TreeDetails[]> {
  return postJson('/trees/details', { trees: keys }, signal)
}

export function fetchIssues(): Promise<{ trees: TreeIssue[]; species: SpeciesIssue[] }> {
  return getJson('/issues')
}

export async function flagTree(
  source: string,
  treeId: string,
  lat: number,
  lon: number,
  speciesBinomial: string | null,
  nameVernacular: string | null,
  street: string | null,
  flags: string[],
  note: string,
): Promise<void> {
  await postJson('/flag', { type: 'tree', city: source, tree_id: treeId, lat, lon, species_binomial: speciesBinomial, name_vernacular: nameVernacular, street, flags, note })
}

export async function flagSpecies(
  speciesBinomial: string,
  nameVernacular: string | null,
  flags: string[],
  note: string,
): Promise<void> {
  await postJson('/flag', { type: 'species', species_binomial: speciesBinomial, name_vernacular: nameVernacular, flags, note })
}

export async function resolveIssue(
  params:
    | { type: 'tree'; source: string; treeId: string }
    | { type: 'species'; speciesBinomial: string },
): Promise<void> {
  const body = params.type === 'tree'
    ? { type: 'tree', city: params.source, tree_id: params.treeId }
    : { type: 'species', species_binomial: params.speciesBinomial }
  await postJson('/issues/resolve', body)
}

/** Nearest tree of a species to a point, or null if the species has no trees. */
export async function fetchNearestTree(speciesId: number, lat: number, lon: number, signal?: AbortSignal): Promise<Tree | null> {
  const response = await fetch(`${API_BASE}/nearest?species=${speciesId}&lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`, { signal })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<Tree>
}
