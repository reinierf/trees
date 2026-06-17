import { Signpost } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FEATURED_CITY_IDS } from '../config'
import type { City } from '../types'

interface Props {
  city: City
  cities: City[]
  onCurrentCity: () => void
}

export function CityButton({ city, cities, onCurrentCity }: Props) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  if (cities.length <= 1) return null

  const featured = FEATURED_CITY_IDS
    .map((id) => cities.find((c) => c.id === id))
    .filter((c): c is City => c != null)

  function selectCity(c: City) {
    if (c.id === city.id) { onCurrentCity() } else { navigate(`/${c.id}`, { state: { fromPicker: true } }) }
    setOpen(false)
  }

  return (
    <div ref={ref} className="absolute top-[120px] left-[12px] z-[1000]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-full p-2 bg-white shadow-md text-gray-700 hover:bg-gray-50 transition-colors"
        title={city.name}
      >
        <Signpost className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute left-full top-0 ml-1 min-w-max bg-white rounded-lg shadow-lg overflow-hidden">
          {featured.map((c) => (
            <button
              key={c.id}
              onClick={() => c.has_data && selectCity(c)}
              disabled={!c.has_data}
              title={c.has_data ? undefined : 'Boomdata binnenkort beschikbaar'}
              className={[
                'block w-full text-left px-4 py-2 text-sm whitespace-nowrap transition-colors',
                !c.has_data
                  ? 'text-gray-400 cursor-not-allowed'
                  : c.id === city.id
                    ? 'font-semibold text-gray-900 bg-gray-50'
                    : 'text-gray-700 hover:bg-gray-50',
              ].join(' ')}
            >
              {c.name}
              {!c.has_data && <span className="ml-1 text-xs">(binnenkort)</span>}
            </button>
          ))}
          <button
            onClick={() => { navigate('/overview'); setOpen(false) }}
            className="block w-full text-left px-4 py-2 text-sm whitespace-nowrap text-gray-700 hover:bg-gray-50 border-t transition-colors"
          >
            Alle steden
          </button>
        </div>
      )}
    </div>
  )
}
