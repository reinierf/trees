import { useCallback } from 'react'
import { useStore } from '../store'
import type { Tree } from '../types'

export function useMapClickHandlers() {
  const openTreeDetail = useStore((s) => s.openTreeDetail)
  const closePopup = useStore((s) => s.closePopup)

  const onMapClick = useCallback(() => {
    const current = useStore.getState().popupView
    if (current?.kind === 'tree-detail') {
      closePopup()
    }
  }, [closePopup])

  const onMarkerClick = useCallback((tree: Tree) => {
    const current = useStore.getState().popupView
    if (current?.kind === 'tree-detail' && current.tree.id === tree.id) {
      closePopup()
    } else {
      openTreeDetail(tree)
    }
  }, [openTreeDetail, closePopup])

  return { onMapClick, onMarkerClick }
}
