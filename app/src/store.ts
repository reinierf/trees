import { create } from 'zustand'
import type { Tree } from './types'

export type PopupView =
  | { kind: 'species-list' }
  | { kind: 'species-detail'; species: string }
  | { kind: 'tree-detail'; tree: Tree; fromSpecies?: string }

interface AppStore {
  popupView: PopupView | null
  visibleTrees: Tree[]
  isLoading: boolean
  tooZoomedOut: boolean
  currentZoom: number
  currentCenter: [number, number] | null

  openSpeciesList: () => void
  openSpeciesDetail: (species: string) => void
  openTreeDetail: (tree: Tree, fromSpecies?: string) => void
  closePopup: () => void
  setVisibleTrees: (trees: Tree[]) => void
  setIsLoading: (v: boolean) => void
  setTooZoomedOut: (v: boolean) => void
  setCurrentZoom: (z: number) => void
  setCurrentCenter: (c: [number, number]) => void
}

export const useStore = create<AppStore>((set) => ({
  popupView: null,
  visibleTrees: [],
  isLoading: false,
  tooZoomedOut: false,
  currentZoom: 0,
  currentCenter: null,

  openSpeciesList: () => set({ popupView: { kind: 'species-list' } }),
  openSpeciesDetail: (species) => set({ popupView: { kind: 'species-detail', species } }),
  openTreeDetail: (tree, fromSpecies) => set({ popupView: { kind: 'tree-detail', tree, fromSpecies } }),
  closePopup: () => set({ popupView: null }),
  setVisibleTrees: (trees) => set({ visibleTrees: trees }),
  setIsLoading: (v) => set({ isLoading: v }),
  setTooZoomedOut: (v) => set({ tooZoomedOut: v }),
  setCurrentZoom: (z) => set({ currentZoom: z }),
  setCurrentCenter: (c) => set({ currentCenter: c }),
}))
