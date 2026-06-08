import { useCallback } from 'react'
import { useStore } from '../store'
import type { Tree } from '../types'

export function useMapClickHandlers() {
  const openTreeDetail = useStore((s) => s.openTreeDetail)
  const openSpeciesDetail = useStore((s) => s.openSpeciesDetail)
  const closePopup = useStore((s) => s.closePopup)

  const onMapClick = useCallback(() => {
    const current = useStore.getState().popupView
    if (current?.kind === 'tree-detail') {
      if (current.fromSpecies) {
        openSpeciesDetail(current.fromSpecies)
      } else {
        closePopup()
      }
    }
  }, [openSpeciesDetail, closePopup])

  const onMarkerClick = useCallback((tree: Tree) => {
    const current = useStore.getState().popupView
    if (current?.kind === 'tree-detail' && current.tree.id === tree.id) {
      if (current.fromSpecies) {
        openSpeciesDetail(current.fromSpecies)
      } else {
        closePopup()
      }
    } else {
      const fromSpecies =
        current?.kind === 'species-detail' ? current.species :
        current?.kind === 'tree-detail' ? current.fromSpecies : undefined
      openTreeDetail(tree, fromSpecies)
    }
  }, [openTreeDetail, openSpeciesDetail, closePopup])

  return { onMapClick, onMarkerClick }
}
