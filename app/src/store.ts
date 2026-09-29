import { create } from 'zustand'
import type { Cluster, Meta, Source, SpeciesEntry, Tree, TreeDetails, TreeIssue, SpeciesIssue } from './types'
import type { TileRange } from './map/mercator'
import type { TreeRef } from './map/urlState'
import { loadPreference, savePreference } from './lib/preferencesStorage'
import { loadFavourites, saveFavourites, type Favourites } from './lib/favouritesStorage'
import { treeKey } from './lib/treeKey'
import { TILE_LAYER_KEY, type TileLayerId } from './map/layers'
import { type Locale } from './translations/locale'

export type { TileLayerId }

const NAME_MODE_KEY = 'species-name-mode'
export type NameMode = 'scientific' | 'vernacular'

const LOCALE_KEY = 'app-locale'

export const PopupKind = {
  SpeciesList: 'species-list',
  TreeDetail: 'tree-detail',
  Favourites: 'favourites',
  Issues: 'issues',
  Sources: 'sources',
  SamePointList: 'same-point-list',
} as const
export type PopupKind = typeof PopupKind[keyof typeof PopupKind]

export type PopupReturnTo = typeof PopupKind.SpeciesList | typeof PopupKind.Favourites | typeof PopupKind.SamePointList

export type PopupView =
  | { kind: typeof PopupKind.SpeciesList; expandedSpecies?: number; selectedTreeKey?: string; query?: string }
  | { kind: typeof PopupKind.TreeDetail; tree: Tree; returnTo: PopupReturnTo }
  | { kind: typeof PopupKind.Favourites }
  | { kind: typeof PopupKind.Issues }
  | { kind: typeof PopupKind.Sources }
  | { kind: typeof PopupKind.SamePointList; trees: Tree[] }

/** What the tile loader found in the current view. */
export interface ViewContents {
  visibleTrees: Tree[]
  clusters: Cluster[]
  /** trees per source in the tiles covering the view */
  sourcesInView: Record<string, number>
  /** trees (matching the species filter, if any) in the tiles covering the view */
  countInView: number
  /** true when every tile in view holds individual trees, i.e. visibleTrees is complete */
  allTreeMode: boolean
  range: TileRange
}

interface AppStore extends ViewContents {
  meta: Meta | null
  speciesById: Map<number, SpeciesEntry>
  sourcesById: Map<string, Source>
  popupView: PopupView | null
  isLoading: boolean
  currentZoom: number
  currentCenter: [number, number] | null
  pendingTree: TreeRef | null
  pendingCenter: [number, number] | null
  pendingHighlight: Tree | null
  speciesFilter: number | null
  nameMode: NameMode
  locale: Locale
  tileLayerId: TileLayerId
  favourites: Favourites
  placesOverlay: boolean
  debugMode: boolean
  treeIssues: TreeIssue[]
  speciesIssues: SpeciesIssue[]
  pendingFlyTo: { lat: number; lon: number; minZoom: number } | null
  pendingHighlightKey: string | null
  pendingSpeciesSelect: number | null

  setMeta: (meta: Meta) => void
  setView: (view: ViewContents) => void
  /** Opens the species list, optionally with its search box filled in. */
  openSpeciesList: (query?: string) => void
  openSpeciesListAt: (speciesId: number, selectedTreeKey?: string) => void
  selectTreeInList: (key: string) => void
  openTreeDetail: (tree: Tree, returnTo?: PopupReturnTo) => void
  openFavourites: () => void
  openSamePointList: (trees: Tree[]) => void
  openIssues: () => void
  openSources: () => void
  closePopup: () => void
  setIsLoading: (v: boolean) => void
  setCurrentZoom: (z: number) => void
  setCurrentCenter: (c: [number, number]) => void
  setPendingTree: (tree: TreeRef | null) => void
  setPendingCenter: (c: [number, number] | null) => void
  setPendingHighlight: (tree: Tree | null) => void
  setSpeciesFilter: (speciesId: number) => void
  clearSpeciesFilter: () => void
  setNameMode: (mode: NameMode) => void
  setLocale: (locale: Locale) => void
  setTileLayerId: (id: TileLayerId) => void
  toggleFavourite: (tree: Tree, details: TreeDetails | null) => void
  setPlacesOverlay: (v: boolean) => void
  setDebugMode: (v: boolean) => void
  setPendingSpeciesSelect: (speciesId: number | null) => void
  setPendingFlyTo: (v: { lat: number; lon: number; minZoom: number } | null) => void
  setPendingHighlightKey: (key: string | null) => void
  setIssues: (trees: TreeIssue[], species: SpeciesIssue[]) => void
  upsertTreeIssue: (issue: TreeIssue) => void
  upsertSpeciesIssue: (issue: SpeciesIssue) => void
  removeTreeIssue: (source: string, treeId: string) => void
  removeSpeciesIssue: (binomial: string) => void
}

const EMPTY_VIEW: ViewContents = {
  visibleTrees: [],
  clusters: [],
  sourcesInView: {},
  countInView: 0,
  allTreeMode: false,
  range: { z: 0, x0: 0, x1: -1, y0: 0, y1: -1 },
}

export const useStore = create<AppStore>((set) => ({
  ...EMPTY_VIEW,
  meta: null,
  speciesById: new Map(),
  sourcesById: new Map(),
  popupView: null,
  isLoading: false,
  currentZoom: 0,
  currentCenter: null,
  pendingTree: null,
  pendingCenter: null,
  pendingHighlight: null,
  speciesFilter: null,
  nameMode: loadPreference<NameMode>(NAME_MODE_KEY, 'scientific'),
  locale: loadPreference<Locale>(LOCALE_KEY, 'nl'),
  tileLayerId: loadPreference<TileLayerId>(TILE_LAYER_KEY, 'streets'),
  favourites: loadFavourites(),
  placesOverlay: false,
  debugMode: import.meta.env.DEV || new URLSearchParams(window.location.search).get('dbg') === '1',
  treeIssues: [],
  speciesIssues: [],
  pendingFlyTo: null,
  pendingHighlightKey: null,
  pendingSpeciesSelect: null,

  setMeta: (meta) => set({
    meta,
    speciesById: new Map(meta.species.map((s) => [s.id, s])),
    sourcesById: new Map(meta.sources.map((s) => [s.id, s])),
    // Species ids are only meaningful within one build.
    speciesFilter: null,
    ...EMPTY_VIEW,
  }),
  setView: (view) => set(view),
  openSpeciesList: (query) => set({ popupView: { kind: PopupKind.SpeciesList, query } }),
  openSpeciesListAt: (speciesId, selectedTreeKey) =>
    set({ popupView: { kind: PopupKind.SpeciesList, expandedSpecies: speciesId, selectedTreeKey } }),
  selectTreeInList: (key) =>
    set((state) => {
      if (state.popupView?.kind !== PopupKind.SpeciesList) return state
      return { popupView: { ...state.popupView, selectedTreeKey: key } }
    }),
  openTreeDetail: (tree, returnTo = PopupKind.SpeciesList) =>
    set({ popupView: { kind: PopupKind.TreeDetail, tree, returnTo } }),
  openFavourites: () => set({ popupView: { kind: PopupKind.Favourites } }),
  openSamePointList: (trees) => set({ popupView: { kind: PopupKind.SamePointList, trees } }),
  openIssues: () => set({ popupView: { kind: PopupKind.Issues } }),
  openSources: () => set({ popupView: { kind: PopupKind.Sources } }),
  closePopup: () => set({ popupView: null }),
  setIsLoading: (v) => set({ isLoading: v }),
  setCurrentZoom: (z) => set({ currentZoom: z }),
  setCurrentCenter: (c) => set({ currentCenter: c }),
  setPendingTree: (tree) => set({ pendingTree: tree }),
  setPendingCenter: (c) => set({ pendingCenter: c }),
  setPendingHighlight: (tree) => set({ pendingHighlight: tree }),
  setSpeciesFilter: (speciesId) => set({ speciesFilter: speciesId }),
  clearSpeciesFilter: () => set({ speciesFilter: null }),
  setNameMode: (mode) => { savePreference(NAME_MODE_KEY, mode); set({ nameMode: mode }) },
  setLocale: (locale) => { savePreference(LOCALE_KEY, locale); set({ locale }) },
  setTileLayerId: (id) => { savePreference(TILE_LAYER_KEY, id); set({ tileLayerId: id }) },
  toggleFavourite: (tree, details) =>
    set((state) => {
      const key = treeKey(tree)
      const updated = { ...state.favourites }
      if (updated[key]) {
        delete updated[key]
      } else {
        updated[key] = {
          ...tree,
          street: details?.street ?? null,
          year_planted: details?.year_planted ?? null,
          addedAt: Date.now(),
        }
      }
      saveFavourites(updated)
      return { favourites: updated }
    }),
  setPlacesOverlay: (v) => set({ placesOverlay: v }),
  setDebugMode: (v) => set({ debugMode: v }),
  setPendingSpeciesSelect: (speciesId) => set({ pendingSpeciesSelect: speciesId }),
  setPendingFlyTo: (v) => set({ pendingFlyTo: v }),
  setPendingHighlightKey: (key) => set({ pendingHighlightKey: key }),
  setIssues: (trees, species) => set({ treeIssues: trees, speciesIssues: species }),
  upsertTreeIssue: (issue) => set((state) => {
    const rest = state.treeIssues.filter((i) => !(i.city === issue.city && i.tree_id === issue.tree_id))
    return { treeIssues: [issue, ...rest] }
  }),
  upsertSpeciesIssue: (issue) => set((state) => {
    const rest = state.speciesIssues.filter((i) => i.species_binomial !== issue.species_binomial)
    return { speciesIssues: [issue, ...rest] }
  }),
  removeTreeIssue: (source, treeId) => set((state) => ({
    treeIssues: state.treeIssues.filter((i) => !(i.city === source && i.tree_id === treeId)),
  })),
  removeSpeciesIssue: (binomial) => set((state) => ({
    speciesIssues: state.speciesIssues.filter((i) => i.species_binomial !== binomial),
  })),
}))
