import { useRef } from 'react'
import { useMap } from '../map/useMap'

export function Map() {
  const containerRef = useRef<HTMLDivElement>(null)
  useMap(containerRef)
  return <div ref={containerRef} className="w-full h-full" />
}
