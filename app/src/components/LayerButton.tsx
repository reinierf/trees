import { Layers } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { LAYERS } from '../map/layers'

interface Props {
  onSwitch: (url: string, attribution: string, maxZoom: number) => void
}

export function LayerButton({ onSwitch }: Props) {
  const tileLayerId = useStore((s) => s.tileLayerId)
  const setTileLayerId = useStore((s) => s.setTileLayerId)
  const [open, setOpen] = useState(false)
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
    setTileLayerId(layer.id)
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
                layer.id === tileLayerId
                  ? 'font-semibold text-gray-900 bg-gray-50'
                  : 'text-gray-700 hover:bg-gray-50',
              ].join(' ')}
            >
              <span className="flex-1">{layer.label}</span>
              {layer.id === tileLayerId && <span className="text-green-600 text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
