import { useCallback } from 'react'
import { useStore, PopupKind } from '../store'
import { treeKey } from '../lib/treeKey'
import type { Tree } from '../types'

export function useMapClickHandlers() {
  const openTreeDetail = useStore((s) => s.openTreeDetail)
  const openSamePointList = useStore((s) => s.openSamePointList)
  const closePopup = useStore((s) => s.closePopup)

  const onMapClick = useCallback(() => {
    const current = useStore.getState().popupView
    if (current?.kind === PopupKind.TreeDetail) {
      closePopup()
    }
  }, [closePopup])

  const onMarkerClick = useCallback((tree: Tree) => {
    const current = useStore.getState().popupView
    if (current?.kind === PopupKind.TreeDetail && treeKey(current.tree) === treeKey(tree)) {
      closePopup()
    } else {
      openTreeDetail(tree)
    }
  }, [openTreeDetail, closePopup])

  const onGroupMarkerClick = useCallback((trees: Tree[]) => {
    const current = useStore.getState().popupView
    const [first] = trees
    if (current?.kind === PopupKind.SamePointList && first &&
      current.trees[0]?.lat === first.lat && current.trees[0]?.lon === first.lon) {
      closePopup()
    } else {
      openSamePointList(trees)
    }
  }, [openSamePointList, closePopup])

  return { onMapClick, onMarkerClick, onGroupMarkerClick }
}
