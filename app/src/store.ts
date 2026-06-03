import { create } from 'zustand'
import type { Tree } from './types'

interface AppStore {
  selectedSpecies: string | null
  selectedTree: Tree | null
  visibleTrees: Tree[]
  isLoading: boolean

  setSelectedSpecies: (s: string | null) => void
  setSelectedTree: (t: Tree | null) => void
  setVisibleTrees: (trees: Tree[]) => void
  setIsLoading: (v: boolean) => void
}

export const useStore = create<AppStore>((set) => ({
  selectedSpecies: null,
  selectedTree: null,
  visibleTrees: [],
  isLoading: false,

  setSelectedSpecies: (s) => set({ selectedSpecies: s }),
  setSelectedTree: (t) => set({ selectedTree: t }),
  setVisibleTrees: (trees) => set({ visibleTrees: trees }),
  setIsLoading: (v) => set({ isLoading: v }),
}))
