import { useRef } from 'react'
import { useMap } from '../map/useMap'
import { useStore } from '../store'
import { MIN_FETCH_ZOOM, CLUSTER_DISABLE_ZOOM } from '../config'

export function Map() {
  const containerRef = useRef<HTMLDivElement>(null)
  useMap(containerRef)
  const tooZoomedOut = useStore((s) => s.tooZoomedOut)
  const currentZoom = useStore((s) => s.currentZoom)

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {tooZoomedOut && (
        <div className="absolute inset-x-0 bottom-8 flex justify-center pointer-events-none z-[1000]">
          <div className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-md text-sm text-muted-foreground">
            Zoom in to see trees
          </div>
        </div>
      )}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none z-[1000] font-mono text-xs bg-black/60 text-white px-2 py-1 rounded">
        z{currentZoom} · fetch≥{MIN_FETCH_ZOOM} · solo≥{CLUSTER_DISABLE_ZOOM}
      </div>
    </div>
  )
}
