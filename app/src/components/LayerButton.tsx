import { Layers } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const LAYERS = [
  {
    id: 'streets',
    label: 'Straat',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  {
    id: 'satellite',
    label: 'Satelliet',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19,
  },
  {
    id: 'topo',
    label: 'Topografisch',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    maxZoom: 17,
  },
  {
    id: 'light',
    label: 'Licht',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
  },
] as const

type LayerId = (typeof LAYERS)[number]['id']

interface Props {
  onSwitch: (url: string, attribution: string, maxZoom: number) => void
}

export function LayerButton({ onSwitch }: Props) {
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<LayerId>('streets')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function select(layer: (typeof LAYERS)[number]) {
    setActiveId(layer.id)
    onSwitch(layer.url, layer.attribution, layer.maxZoom)
    setOpen(false)
  }

  return (
    <div ref={ref} className="absolute top-[44px] right-2 z-[1000]">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Kaartlaag"
        className={[
          'rounded-full p-2 shadow-md transition-colors',
          open ? 'bg-gray-100 text-green-700' : 'bg-white text-gray-700 hover:bg-gray-50',
        ].join(' ')}
      >
        <Layers className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-full top-0 mr-1 min-w-max bg-white rounded-lg shadow-lg overflow-hidden">
          {LAYERS.map((layer) => (
            <button
              key={layer.id}
              onClick={() => select(layer)}
              className={[
                'flex items-center gap-3 w-full text-left px-4 py-2 text-sm whitespace-nowrap transition-colors',
                layer.id === activeId
                  ? 'font-semibold text-gray-900 bg-gray-50'
                  : 'text-gray-700 hover:bg-gray-50',
              ].join(' ')}
            >
              <span className="flex-1">{layer.label}</span>
              {layer.id === activeId && <span className="text-green-600 text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
