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
  name_indigenous: string | null
  species: string
  species_binomial: string
  species_cultivar: string | null
  genus: string
  neighbourhood: string
  street: string
  trunk_diameter: number | null
  crown_spread: number | null
  last_updated: string
}

export interface SpeciesItem {
  species: string
  name_indigenous: string
}
