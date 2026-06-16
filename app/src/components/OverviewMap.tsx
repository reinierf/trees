import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import L from 'leaflet'
import { LAYERS } from '../map/layers'
import { createCityCircleMarker } from '../map/markerIcon'
import type { City } from '../types'

const NL_CENTER: [number, number] = [52.22, 5.29]
const NL_ZOOM = 7

interface Props {
  cities: City[]
  onClose?: () => void
}

export function OverviewMap({ cities, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return

    const map = L.map(el, { center: NL_CENTER, zoom: NL_ZOOM })
    mapRef.current = map

    const streets = LAYERS[0]
    L.tileLayer(streets.url, { attribution: streets.attribution, maxZoom: streets.maxZoom }).addTo(map)

    for (const city of cities) {
      const marker = createCityCircleMarker(city)
      marker.on('click', () => navigate(`/${city.id}`))
      marker.addTo(map)
    }

    map.whenReady(() => map.invalidateSize())

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [cities, navigate])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute inset-x-0 top-4 flex justify-center pointer-events-none z-[1000]">
        <div className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-md text-sm text-muted-foreground">
          Kies een stad om bomen te verkennen
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-[1000] rounded-full p-2 bg-white shadow-md text-gray-700 hover:bg-gray-50 transition-colors"
          aria-label="Sluiten"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
