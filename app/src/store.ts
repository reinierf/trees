import { create } from 'zustand'
import type { Tree, SpeciesItem } from './types'
import { loadPreference, savePreference } from './lib/preferencesStorage'
import { loadFavourites, saveFavourites, type Favourites } from './lib/favouritesStorage'
import { TILE_LAYER_KEY, type TileLayerId } from './map/layers'

export type { TileLayerId }

const NAME_MODE_KEY = 'species-name-mode'
export type NameMode = 'scientific' | 'indigenous'

export type PopupView =
  | { kind: 'species-list'; expandedSpecies?: string; selectedTreeId?: string }
  | { kind: 'tree-detail'; tree: Tree; returnTo: 'species-list' | 'favourites' }
  | { kind: 'favourites' }

interface AppStore {
  popupView: PopupView | null
  visibleTrees: Tree[]
  isLoading: boolean
  tooZoomedOut: boolean
  currentZoom: number
  currentCenter: [number, number] | null
  pendingTreeId: string | null
  pendingCenter: [number, number] | null
  pendingHighlight: Tree | null
  citySpecies: SpeciesItem[]
  speciesFilter: string | null
  isLoadingSpeciesFilter: boolean
  nameMode: NameMode
  tileLayerId: TileLayerId
  favourites: Favourites
  debugMode: boolean

  openSpeciesList: () => void
  openSpeciesListAt: (species: string, selectedTreeId?: string) => void
  selectTreeInList: (treeId: string) => void
  openTreeDetail: (tree: Tree, returnTo?: 'species-list' | 'favourites') => void
  openFavourites: () => void
  closePopup: () => void
  setVisibleTrees: (trees: Tree[]) => void
  setIsLoading: (v: boolean) => void
  setTooZoomedOut: (v: boolean) => void
  setCurrentZoom: (z: number) => void
  setCurrentCenter: (c: [number, number]) => void
  setPendingTreeId: (id: string | null) => void
  setPendingCenter: (c: [number, number] | null) => void
  setPendingHighlight: (tree: Tree | null) => void
  setCitySpecies: (species: SpeciesItem[]) => void
  setSpeciesFilter: (species: string, trees: Tree[]) => void
  clearSpeciesFilter: () => void
  setIsLoadingSpeciesFilter: (v: boolean) => void
  setNameMode: (mode: NameMode) => void
  setTileLayerId: (id: TileLayerId) => void
  toggleFavourite: (cityId: string, tree: Tree) => void
  setDebugMode: (v: boolean) => void
}

export const useStore = create<AppStore>((set) => ({
  popupView: null,
  visibleTrees: [],
  isLoading: false,
  tooZoomedOut: false,
  currentZoom: 0,
  currentCenter: null,
  pendingTreeId: null,
  pendingCenter: null,
  pendingHighlight: null,
  citySpecies: [],
  speciesFilter: null,
  isLoadingSpeciesFilter: false,
  nameMode: loadPreference<NameMode>(NAME_MODE_KEY, 'scientific'),
  tileLayerId: loadPreference<TileLayerId>(TILE_LAYER_KEY, 'streets'),
  favourites: loadFavourites(),
  debugMode: import.meta.env.DEV || new URLSearchParams(window.location.search).get('dbg') === '1',

  openSpeciesList: () => set({ popupView: { kind: 'species-list' } }),
  openSpeciesListAt: (species, selectedTreeId) =>
    set({ popupView: { kind: 'species-list', expandedSpecies: species, selectedTreeId } }),
  selectTreeInList: (treeId) =>
    set((state) => {
      if (state.popupView?.kind !== 'species-list') return state
      return { popupView: { ...state.popupView, selectedTreeId: treeId } }
    }),
  openTreeDetail: (tree, returnTo = 'species-list') =>
    set({ popupView: { kind: 'tree-detail', tree, returnTo } }),
  openFavourites: () => set({ popupView: { kind: 'favourites' } }),
  closePopup: () => set({ popupView: null }),
  setVisibleTrees: (trees) => set({ visibleTrees: trees }),
  setIsLoading: (v) => set({ isLoading: v }),
  setTooZoomedOut: (v) => set({ tooZoomedOut: v }),
  setCurrentZoom: (z) => set({ currentZoom: z }),
  setCurrentCenter: (c) => set({ currentCenter: c }),
  setPendingTreeId: (id) => set({ pendingTreeId: id }),
  setPendingCenter: (c) => set({ pendingCenter: c }),
  setPendingHighlight: (tree) => set({ pendingHighlight: tree }),
  setCitySpecies: (species) => set({ citySpecies: species }),
  setSpeciesFilter: (species, trees) => set({ speciesFilter: species, visibleTrees: trees, tooZoomedOut: false, isLoadingSpeciesFilter: false }),
  clearSpeciesFilter: () => set({ speciesFilter: null, visibleTrees: [] }),
  setIsLoadingSpeciesFilter: (v) => set({ isLoadingSpeciesFilter: v }),
  setNameMode: (mode) => { savePreference(NAME_MODE_KEY, mode); set({ nameMode: mode }) },
  setTileLayerId: (id) => { savePreference(TILE_LAYER_KEY, id); set({ tileLayerId: id }) },
  setDebugMode: (v) => set({ debugMode: v }),
  toggleFavourite: (cityId, tree) =>
    set((state) => {
      const cityFavs = state.favourites[cityId] ?? []
      const exists = cityFavs.some((t) => t.id === tree.id)
      const newFavs = exists ? cityFavs.filter((t) => t.id !== tree.id) : [...cityFavs, tree]
      const updated = { ...state.favourites, [cityId]: newFavs }
      saveFavourites(updated)
      return { favourites: updated }
    }),
}))
