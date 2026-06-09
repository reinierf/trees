import { create } from 'zustand'
import type { Tree } from './types'

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
}

export const useStore = create<AppStore>((set) => ({
  popupView: null,
  visibleTrees: [],
  isLoading: false,
  tooZoomedOut: false,
  currentZoom: 0,
  currentCenter: null,
  pendingTreeId: null,

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
}))
