import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMap } from '../map/useMap'
import { useStore } from '../store'
import { MIN_FETCH_ZOOM, CLUSTER_DISABLE_ZOOM } from '../config'
import { Popup } from './Popup'
import { CityButton } from './CityButton'
import { LocationButton } from './LocationButton'
import { FullscreenButton } from './FullscreenButton'
import type { City } from '../types'

interface Props {
  city: City
  cities: City[]
}

function pickCity(lat: number, lon: number, cities: City[]): string {
  const contained = cities.filter(
    (c) => lat >= c.bbox.s && lat <= c.bbox.n && lon >= c.bbox.w && lon <= c.bbox.e,
  )
  if (contained.length === 1) return contained[0].id
  // Euclidean distance in degrees is fine for Netherlands-scale distances
  let nearest = cities[0]
  let minDist = Infinity
  for (const c of cities) {
    const d = Math.hypot(lat - c.center[0], lon - c.center[1])
    if (d < minDist) { minDist = d; nearest = c }
  }
  return nearest.id
}

export function Map({ city, cities }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const controllerRef = useMap(containerRef, city, cities)
  const navigate = useNavigate()
  const tooZoomedOut = useStore((s) => s.tooZoomedOut)
  const currentZoom = useStore((s) => s.currentZoom)
  const currentCenter = useStore((s) => s.currentCenter)

  const centerStr = currentCenter
    ? `[${currentCenter[0].toFixed(4)}, ${currentCenter[1].toFixed(4)}]`
    : ''

  const showDebug = import.meta.env.DEV || new URLSearchParams(window.location.search).get('dbg') === '1'

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {tooZoomedOut && (
        <div className="absolute inset-x-0 top-2 flex justify-center pointer-events-none z-[1000]">
          <div className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-md text-sm text-muted-foreground">
            Zoom in to see trees
          </div>
        </div>
      )}
      {showDebug && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none z-[1000] font-mono text-xs bg-black/60 text-white px-2 py-1 rounded">
          z{currentZoom} · fetch≥{MIN_FETCH_ZOOM} · solo≥{CLUSTER_DISABLE_ZOOM}{centerStr && ` · ${centerStr}`}
        </div>
      )}
      <Popup onCenter={(lat, lon) => controllerRef.current?.panTo(lat, lon)} />
      <FullscreenButton />
      <CityButton city={city} cities={cities} />
      <LocationButton onLocate={(lat, lon) => {
        const pickedCityId = pickCity(lat, lon, cities)
        if (pickedCityId !== city.id) {
          navigate(`/${pickedCityId}?lat=${lat.toFixed(7)}&lon=${lon.toFixed(7)}`)
        } else {
          controllerRef.current?.flyToLocation(lat, lon)
          controllerRef.current?.setLocationMarker(lat, lon)
        }
      }} />
    </div>
  )
}
