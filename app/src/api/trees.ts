import type { Bbox, City, SpeciesItem, Tree } from '../types'
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

export async function flagTree(
  city: string,
  treeId: string,
  binomial: string,
  dutchName: string | null,
  fields: { name: string; value: string }[],
  note: string,
): Promise<void> {
  const response = await fetch(`${API_BASE}/flag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city, tree_id: treeId, binomial, dutch_name: dutchName ?? '', fields, note }),
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
