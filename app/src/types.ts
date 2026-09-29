export interface Coordinate {
  lat: number
  lon: number
}

export interface Bbox {
  nw: Coordinate
  se: Coordinate
}

/** A tree as the map holds it: position and species only. Details are fetched on demand. */
export interface Tree {
  source: string
  id: string
  lat: number
  lon: number
  speciesId: number
}

/** Full record of one tree, from /api/tree or /api/trees/details. */
export interface TreeDetails {
  source: string
  id: string
  lat: number
  lon: number
  species_id: number
  species: string | null
  species_cultivar: string | null
  year_planted: string | null
  neighbourhood: string | null
  street: string | null
  trunk_diameter: number | null
  crown_spread: number | null
}

export type LocalizedNames = { nl?: string; en?: string; de?: string; fr?: string }

export interface SpeciesEntry {
  id: number
  /** species_binomial, or the source's raw species string when no binomial could be resolved */
  key: string
  binomial: string | null
  names: LocalizedNames
}

export interface SourceMeta {
  source?: string
  lastFetched?: string
  description?: LocalizedNames
}

/** A tree dataset: a municipality or an institution (arboretum and similar). */
export interface Source {
  id: string
  name: string
  type: 'city' | 'institution'
  center: [number, number]
  bbox: { s: number; n: number; w: number; e: number }
  tree_count: number
  meta: SourceMeta
  /** Zoom at which markers stop clustering while this source is in view — only needed for
   *  dense, spatially small datasets (e.g. an arboretum). Falls back to CLUSTER_DISABLE_ZOOM. */
  clusterDisableZoom?: number
}

export interface Meta {
  version: string
  sources: Source[]
  species: SpeciesEntry[]
}

export interface Cluster {
  lat: number
  lon: number
  count: number
}

/** One 256 px web-mercator tile as served by /api/tiles, with trees decoded. */
export interface TilePayload {
  count: number
  sources: Record<string, number>
  clusters: Cluster[] | null
  trees: Tree[] | null
}

export interface TreeIssue {
  /** source id */
  city: string
  tree_id: string
  lat: number | null
  lon: number | null
  species_binomial: string | null
  name_vernacular: string | null
  street: string | null
  flags: string[]
  note: string | null
  created_at: string
  updated_at: string
}

export interface SpeciesIssue {
  species_binomial: string
  name_vernacular: string | null
  flags: string[]
  note: string | null
  created_at: string
  updated_at: string
}
