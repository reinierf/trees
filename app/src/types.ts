export interface Coordinate {
  lat: number
  lon: number
}

export interface Bbox {
  nw: Coordinate
  se: Coordinate
}

export interface Tree {
  lat: number
  lon: number
  id: string
  year_planted: string
  name_vernacular: string | null
  species: string
  species_binomial: string | null
  species_cultivar: string | null
  neighbourhood: string
  street: string
  trunk_diameter: number | null
  crown_spread: number | null
}

export interface SpeciesItem {
  species: string
  species_binomial: string | null
  name_vernacular: string | null
  count: number
}

export interface TreeIssue {
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

export type VernacularNames = Record<string, { nl?: string; en?: string; de?: string; fr?: string }>

export interface CityMeta {
  source?: string
  lastFetched?: string
  description?: { nl?: string; en?: string; de?: string; fr?: string }
}

export interface City {
  id: string
  name: string
  center: [number, number]
  bbox: { s: number; n: number; w: number; e: number }
  tree_count: number
  has_data: boolean
  meta?: CityMeta
  /** 'city' for regular municipalities, 'institution' for arboretums and similar.
   *  Defaults to 'city' if absent. */
  type?: 'city' | 'institution'
  /** Overrides config.ts's CLUSTER_DISABLE_ZOOM for this city — only needed for
   *  dense, spatially small datasets (e.g. an arboretum) where the default would
   *  render too many individual DOM markers at once. Falls back to the global
   *  default when absent. */
  clusterDisableZoom?: number
  /** Overrides config.ts's MAP_ZOOM when flying to this city's center (initial
   *  load, city picker, clicking its overview marker, or returning with no saved
   *  position) — only needed for small places (e.g. an arboretum) where the
   *  default zoom is too far out. Falls back to the global default when absent. */
  mapZoom?: number
  /** Overrides config.ts's MIN_FETCH_ZOOM — only needed for sparse, spatially
   *  spread datasets (e.g. a curated "monumental trees" layer covering a whole
   *  merged municipality) where trees far from the city center would otherwise
   *  never be fetched/discovered unless the user already knows to pan there.
   *  Pairs with maxViewportDeg2 below, since a lower fetch zoom implies a wider
   *  viewport. Falls back to the global default when absent. */
  minFetchZoom?: number
  /** Overrides config.ts's MAX_VIEWPORT_DEG2 — only needed alongside a lowered
   *  minFetchZoom, since the global cap assumes fetches happen at street-level
   *  zoom and would otherwise silently block fetching the wider viewport a low
   *  minFetchZoom allows. Falls back to the global default when absent. */
  maxViewportDeg2?: number
}
