import { useRef } from 'react'
import { useMap } from '../map/useMap'
import { useStore } from '../store'
import { MIN_FETCH_ZOOM, CLUSTER_DISABLE_ZOOM } from '../config'
import { Popup } from './Popup'
import { LocationButton } from './LocationButton'

export function Map() {
  const containerRef = useRef<HTMLDivElement>(null)
  const controllerRef = useMap(containerRef)
  const tooZoomedOut = useStore((s) => s.tooZoomedOut)
  const currentZoom = useStore((s) => s.currentZoom)
  const currentCenter = useStore((s) => s.currentCenter)

  const centerStr = currentCenter
    ? `[${currentCenter[0].toFixed(4)}, ${currentCenter[1].toFixed(4)}]`
    : ''

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
        z{currentZoom} · fetch≥{MIN_FETCH_ZOOM} · solo≥{CLUSTER_DISABLE_ZOOM}{centerStr && ` · ${centerStr}`}
      </div>
      <Popup onCenter={(lat, lon) => controllerRef.current?.panTo(lat, lon)} />
      <LocationButton onLocate={(lat, lon) => {
        controllerRef.current?.flyToLocation(lat, lon)
        controllerRef.current?.setLocationMarker(lat, lon)
      }} />
    </div>
  )
}
