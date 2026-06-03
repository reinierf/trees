import { useRef } from 'react'
import { useMap } from '../map/useMap'
import { useStore } from '../store'

export function Map() {
  const containerRef = useRef<HTMLDivElement>(null)
  useMap(containerRef)
  const tooZoomedOut = useStore((s) => s.tooZoomedOut)

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
    </div>
  )
}
