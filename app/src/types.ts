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
  description?: string
}

export interface City {
  id: string
  name: string
  center: [number, number]
  bbox: { s: number; n: number; w: number; e: number }
  tree_count: number
  has_data: boolean
  meta?: CityMeta
}
