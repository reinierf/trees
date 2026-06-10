import { create } from 'zustand'
import type { Tree, SpeciesItem } from './types'
import { loadPreference, savePreference } from './lib/preferencesStorage'

const NAME_MODE_KEY = 'species-name-mode'
export type NameMode = 'scientific' | 'indigenous'

export type PopupView =
  | { kind: 'species-list'; expandedSpecies?: string; selectedTreeId?: string }
  | { kind: 'tree-detail'; tree: Tree }

interface AppStore {
  popupView: PopupView | null
  visibleTrees: Tree[]
  isLoading: boolean
  tooZoomedOut: boolean
  currentZoom: number
  currentCenter: [number, number] | null
  pendingTreeId: string | null
  citySpecies: SpeciesItem[]
  speciesFilter: string | null
  isLoadingSpeciesFilter: boolean
  nameMode: NameMode

  openSpeciesList: () => void
  openSpeciesListAt: (species: string, selectedTreeId?: string) => void
  selectTreeInList: (treeId: string) => void
  openTreeDetail: (tree: Tree) => void
  closePopup: () => void
  setVisibleTrees: (trees: Tree[]) => void
  setIsLoading: (v: boolean) => void
  setTooZoomedOut: (v: boolean) => void
  setCurrentZoom: (z: number) => void
  setCurrentCenter: (c: [number, number]) => void
  setPendingTreeId: (id: string | null) => void
  setCitySpecies: (species: SpeciesItem[]) => void
  setSpeciesFilter: (species: string, trees: Tree[]) => void
  clearSpeciesFilter: () => void
  setIsLoadingSpeciesFilter: (v: boolean) => void
  setNameMode: (mode: NameMode) => void
}

export const useStore = create<AppStore>((set) => ({
  popupView: null,
  visibleTrees: [],
  isLoading: false,
  tooZoomedOut: false,
  currentZoom: 0,
  currentCenter: null,
  pendingTreeId: null,
  citySpecies: [],
  speciesFilter: null,
  isLoadingSpeciesFilter: false,
  nameMode: loadPreference<NameMode>(NAME_MODE_KEY, 'scientific'),

  openSpeciesList: () => set({ popupView: { kind: 'species-list' } }),
  openSpeciesListAt: (species, selectedTreeId) =>
    set({ popupView: { kind: 'species-list', expandedSpecies: species, selectedTreeId } }),
  selectTreeInList: (treeId) =>
    set((state) => {
      if (state.popupView?.kind !== 'species-list') return state
      return { popupView: { ...state.popupView, selectedTreeId: treeId } }
    }),
  openTreeDetail: (tree) => set({ popupView: { kind: 'tree-detail', tree } }),
  closePopup: () => set({ popupView: null }),
  setVisibleTrees: (trees) => set({ visibleTrees: trees }),
  setIsLoading: (v) => set({ isLoading: v }),
  setTooZoomedOut: (v) => set({ tooZoomedOut: v }),
  setCurrentZoom: (z) => set({ currentZoom: z }),
  setCurrentCenter: (c) => set({ currentCenter: c }),
  setPendingTreeId: (id) => set({ pendingTreeId: id }),
  setCitySpecies: (species) => set({ citySpecies: species }),
  setSpeciesFilter: (species, trees) => set({ speciesFilter: species, visibleTrees: trees, tooZoomedOut: false, isLoadingSpeciesFilter: false }),
  clearSpeciesFilter: () => set({ speciesFilter: null, visibleTrees: [] }),
  setIsLoadingSpeciesFilter: (v) => set({ isLoadingSpeciesFilter: v }),
  setNameMode: (mode) => { savePreference(NAME_MODE_KEY, mode); set({ nameMode: mode }) },
}))
