import { create } from 'zustand'
import type { Tree, SpeciesItem, TreeIssue, SpeciesIssue, VernacularNames } from './types'
import { loadPreference, savePreference } from './lib/preferencesStorage'
import { loadFavourites, saveFavourites, type Favourites } from './lib/favouritesStorage'
import { TILE_LAYER_KEY, type TileLayerId } from './map/layers'

export type { TileLayerId }

const NAME_MODE_KEY = 'species-name-mode'
export type NameMode = 'scientific' | 'vernacular'

export const PopupKind = {
  SpeciesList: 'species-list',
  TreeDetail: 'tree-detail',
  Favourites: 'favourites',
  Issues: 'issues',
} as const
export type PopupKind = typeof PopupKind[keyof typeof PopupKind]

export type PopupReturnTo = typeof PopupKind.SpeciesList | typeof PopupKind.Favourites

export type PopupView =
  | { kind: typeof PopupKind.SpeciesList; expandedSpecies?: string; selectedTreeId?: string }
  | { kind: typeof PopupKind.TreeDetail; tree: Tree; returnTo: PopupReturnTo }
  | { kind: typeof PopupKind.Favourites }
  | { kind: typeof PopupKind.Issues }

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
  vernacularNames: VernacularNames
  favourites: Favourites
  debugMode: boolean
  treeIssues: TreeIssue[]
  speciesIssues: SpeciesIssue[]
  pendingFlyTo: { lat: number; lon: number; minZoom: number } | null
  pendingHighlightId: string | null

  openSpeciesList: () => void
  openSpeciesListAt: (species: string, selectedTreeId?: string) => void
  selectTreeInList: (treeId: string) => void
  openTreeDetail: (tree: Tree, returnTo?: PopupReturnTo) => void
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
  setVernacularNames: (names: VernacularNames) => void
  setTileLayerId: (id: TileLayerId) => void
  toggleFavourite: (cityId: string, tree: Tree) => void
  setDebugMode: (v: boolean) => void
  pendingSearch: string | null
  setPendingSearch: (q: string | null) => void
  pendingSpeciesSelect: string | null
  setPendingSpeciesSelect: (species: string | null) => void
  setPendingFlyTo: (v: { lat: number; lon: number; minZoom: number } | null) => void
  setPendingHighlightId: (id: string | null) => void
  openIssues: () => void
  setIssues: (trees: TreeIssue[], species: SpeciesIssue[]) => void
  upsertTreeIssue: (issue: TreeIssue) => void
  upsertSpeciesIssue: (issue: SpeciesIssue) => void
  removeTreeIssue: (city: string, treeId: string) => void
  removeSpeciesIssue: (binomial: string) => void
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
  vernacularNames: {},
  tileLayerId: loadPreference<TileLayerId>(TILE_LAYER_KEY, 'streets'),
  favourites: loadFavourites(),
  debugMode: import.meta.env.DEV || new URLSearchParams(window.location.search).get('dbg') === '1',
  treeIssues: [],
  speciesIssues: [],
  pendingSearch: null,
  pendingSpeciesSelect: null,
  pendingFlyTo: null,
  pendingHighlightId: null,

  openSpeciesList: () => set({ popupView: { kind: PopupKind.SpeciesList } }),
  openSpeciesListAt: (species, selectedTreeId) =>
    set({ popupView: { kind: PopupKind.SpeciesList, expandedSpecies: species, selectedTreeId } }),
  selectTreeInList: (treeId) =>
    set((state) => {
      if (state.popupView?.kind !== PopupKind.SpeciesList) return state
      return { popupView: { ...state.popupView, selectedTreeId: treeId } }
    }),
  openTreeDetail: (tree, returnTo = PopupKind.SpeciesList) =>
    set({ popupView: { kind: PopupKind.TreeDetail, tree, returnTo } }),
  openFavourites: () => set({ popupView: { kind: PopupKind.Favourites } }),
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
  setVernacularNames: (names) => set({ vernacularNames: names }),
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
  setPendingSearch: (q) => set({ pendingSearch: q }),
  setPendingSpeciesSelect: (species) => set({ pendingSpeciesSelect: species }),
  setPendingFlyTo: (v) => set({ pendingFlyTo: v }),
  setPendingHighlightId: (id) => set({ pendingHighlightId: id }),
  openIssues: () => set({ popupView: { kind: PopupKind.Issues } }),
  setIssues: (trees, species) => set({ treeIssues: trees, speciesIssues: species }),
  upsertTreeIssue: (issue) => set((state) => {
    const rest = state.treeIssues.filter((i) => !(i.city === issue.city && i.tree_id === issue.tree_id))
    return { treeIssues: [issue, ...rest] }
  }),
  upsertSpeciesIssue: (issue) => set((state) => {
    const rest = state.speciesIssues.filter((i) => i.species_binomial !== issue.species_binomial)
    return { speciesIssues: [issue, ...rest] }
  }),
  removeTreeIssue: (city, treeId) => set((state) => ({
    treeIssues: state.treeIssues.filter((i) => !(i.city === city && i.tree_id === treeId)),
  })),
  removeSpeciesIssue: (binomial) => set((state) => ({
    speciesIssues: state.speciesIssues.filter((i) => i.species_binomial !== binomial),
  })),
}))
