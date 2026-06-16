import { useCallback } from 'react'
import { useStore, PopupKind } from '../store'
import type { Tree } from '../types'

export function useMapClickHandlers() {
  const openTreeDetail = useStore((s) => s.openTreeDetail)
  const closePopup = useStore((s) => s.closePopup)

  const onMapClick = useCallback(() => {
    const current = useStore.getState().popupView
    if (current?.kind === PopupKind.TreeDetail) {
      closePopup()
    }
  }, [closePopup])

  const onMarkerClick = useCallback((tree: Tree) => {
    const current = useStore.getState().popupView
    if (current?.kind === PopupKind.TreeDetail && current.tree.id === tree.id) {
      closePopup()
    } else {
      openTreeDetail(tree)
    }
  }, [openTreeDetail, closePopup])

  return { onMapClick, onMarkerClick }
}
