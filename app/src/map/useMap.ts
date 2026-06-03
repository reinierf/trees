import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { MapController } from './MapController'
import { useStore } from '../store'

export function useMap(containerRef: RefObject<HTMLDivElement | null>) {
  const controllerRef = useRef<MapController | null>(null)
  const setSelectedTree = useStore((s) => s.setSelectedTree)
  const setSelectedSpecies = useStore((s) => s.setSelectedSpecies)
  const visibleTrees = useStore((s) => s.visibleTrees)
  const selectedSpecies = useStore((s) => s.selectedSpecies)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const controller = new MapController({
      onMoveEnd: (bounds) => {
        // Step 5: trigger tile cache + fetch
        console.log('map moveend', bounds)
      },
      onMarkerClick: (tree) => {
        setSelectedTree(tree)
        setSelectedSpecies(tree.species_binomial)
      },
    })

    controller.init(el)
    controllerRef.current = controller

    return () => {
      controller.destroy()
      controllerRef.current = null
    }
  }, [setSelectedTree, setSelectedSpecies])

  useEffect(() => {
    controllerRef.current?.setTrees(visibleTrees)
  }, [visibleTrees])

  useEffect(() => {
    controllerRef.current?.highlightSpecies(selectedSpecies)
  }, [selectedSpecies])

  return controllerRef
}
