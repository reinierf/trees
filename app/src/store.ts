import { create } from 'zustand'
import type { Tree } from './types'

interface AppStore {
  selectedSpecies: string | null
  selectedTree: Tree | null
  visibleTrees: Tree[]
  isLoading: boolean
  tooZoomedOut: boolean
  currentZoom: number
  currentCenter: [number, number] | null

  setSelectedSpecies: (s: string | null) => void
  setSelectedTree: (t: Tree | null) => void
  setVisibleTrees: (trees: Tree[]) => void
  setIsLoading: (v: boolean) => void
  setTooZoomedOut: (v: boolean) => void
  setCurrentZoom: (z: number) => void
  setCurrentCenter: (c: [number, number]) => void
}

export const useStore = create<AppStore>((set) => ({
  selectedSpecies: null,
  selectedTree: null,
  visibleTrees: [],
  isLoading: false,
  tooZoomedOut: false,
  currentZoom: 0,
  currentCenter: null,

  setSelectedSpecies: (s) => set({ selectedSpecies: s }),
  setSelectedTree: (t) => set({ selectedTree: t }),
  setVisibleTrees: (trees) => set({ visibleTrees: trees }),
  setIsLoading: (v) => set({ isLoading: v }),
  setTooZoomedOut: (v) => set({ tooZoomedOut: v }),
  setCurrentZoom: (z) => set({ currentZoom: z }),
  setCurrentCenter: (c) => set({ currentCenter: c }),
}))
