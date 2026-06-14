import type { Bbox, City, SpeciesItem, Tree, TreeIssue, SpeciesIssue, VernacularNames } from '../types'
import { API_BASE, API_LIMIT } from '../config'

export async function fetchCities(): Promise<City[]> {
  const response = await fetch(`${API_BASE}/cities`)
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<City[]>
}

export async function fetchTrees(bboxes: Bbox[], city: string, signal?: AbortSignal): Promise<Tree[]> {
  const response = await fetch(`${API_BASE}/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      city,
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

export async function fetchCitySpecies(city: string): Promise<SpeciesItem[]> {
  const response = await fetch(`${API_BASE}/species?city=${encodeURIComponent(city)}`)
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<SpeciesItem[]>
}

export async function fetchIssues(): Promise<{ trees: TreeIssue[]; species: SpeciesIssue[] }> {
  const response = await fetch(`${API_BASE}/issues`)
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<{ trees: TreeIssue[]; species: SpeciesIssue[] }>
}

export async function fetchVernacularNames(): Promise<VernacularNames> {
  const response = await fetch(`${API_BASE}/vernacular-names`)
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<VernacularNames>
}

export async function flagTree(
  city: string,
  treeId: string,
  lat: number,
  lon: number,
  speciesBinomial: string | null,
  nameVernacular: string | null,
  street: string | null,
  flags: string[],
  note: string,
): Promise<void> {
  const response = await fetch(`${API_BASE}/flag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'tree', city, tree_id: treeId, lat, lon, species_binomial: speciesBinomial, name_vernacular: nameVernacular, street, flags, note }),
  })
  if (!response.ok) throw new Error(`API ${response.status}`)
}

export async function flagSpecies(
  speciesBinomial: string,
  nameVernacular: string | null,
  flags: string[],
  note: string,
): Promise<void> {
  const response = await fetch(`${API_BASE}/flag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'species', species_binomial: speciesBinomial, name_vernacular: nameVernacular, flags, note }),
  })
  if (!response.ok) throw new Error(`API ${response.status}`)
}

export async function resolveIssue(
  params:
    | { type: 'tree'; city: string; treeId: string }
    | { type: 'species'; speciesBinomial: string },
): Promise<void> {
  const body = params.type === 'tree'
    ? { type: 'tree', city: params.city, tree_id: params.treeId }
    : { type: 'species', species_binomial: params.speciesBinomial }
  const response = await fetch(`${API_BASE}/issues/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`API ${response.status}`)
}

export async function fetchTreesBySpecies(
  city: string,
  speciesBinomial: string,
  cityBbox: City['bbox'],
  signal?: AbortSignal,
): Promise<Tree[]> {
  const response = await fetch(`${API_BASE}/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      city,
      bboxes: [cityBbox],
      species: speciesBinomial,
      strict: false,
      limit: API_LIMIT,
    }),
    signal,
  })
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<Tree[]>
}
