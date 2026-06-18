import { Signpost } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadRecentCityIds } from '../lib/recentCitiesStorage'
import type { City } from '../types'

interface Props {
  city: City | null
  cities: City[]
  onCurrentCity?: () => void
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

  const recentIds = loadRecentCityIds()
  const recent = recentIds
    .map((id) => cities.find((c) => c.id === id))
    .filter((c): c is City => c != null && c.has_data)

  function selectCity(c: City) {
    if (city && c.id === city.id) { onCurrentCity?.() } else { navigate(`/${c.id}`, { state: { fromPicker: true } }) }
    setOpen(false)
  }

  return (
    <div ref={ref} className="absolute top-[116px] right-2 z-[1000]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-full p-2 bg-white shadow-md text-gray-700 hover:bg-gray-50 transition-colors"
        title="Kies stad"
      >
        <Signpost className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-full top-0 mr-1 min-w-max bg-white rounded-lg shadow-lg overflow-hidden">
          <button
            onClick={() => { navigate('/overview'); setOpen(false) }}
            className="block w-full text-left px-4 py-2 text-sm whitespace-nowrap text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Alle steden
          </button>
          {recent.length > 0 && (
            <div className="border-t">
              {recent.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectCity(c)}
                  className={[
                    'block w-full text-left px-4 py-2 text-sm whitespace-nowrap transition-colors',
                    c.id === city?.id
                      ? 'font-semibold text-gray-900 bg-gray-50'
                      : 'text-gray-700 hover:bg-gray-50',
                  ].join(' ')}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
