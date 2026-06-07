import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import type { City } from '../types'

interface Props {
  city: City
  cities: City[]
}

export function CityButton({ city, cities }: Props) {
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

  return (
    <div ref={ref} className="absolute top-[120px] left-[12px] z-[1000]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-full p-2 bg-white shadow-md text-gray-700 hover:bg-gray-50 transition-colors"
        title={city.name}
      >
        <Building2 className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 min-w-max bg-white rounded-lg shadow-lg overflow-hidden">
          {cities.map((c) => (
            <button
              key={c.id}
              onClick={() => { navigate(`/${c.id}`); setOpen(false) }}
              className={[
                'block w-full text-left px-4 py-2 text-sm whitespace-nowrap transition-colors',
                c.id === city.id
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
  )
}
