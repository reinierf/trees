import { Signpost } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { loadRecentCityIds } from '../lib/recentCitiesStorage'
import { useStore } from '../store'
import { useT } from '../translations/useT'
import type { Source } from '../types'

interface Props {
  /** Zoom out to the national overview and show every place on the map. */
  onAllPlaces: () => void
  onPlace: (source: Source) => void
}

/** Place picker: jump to a recently visited place, or show all places on the map. */
export function CityButton({ onAllPlaces, onPlace }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const sourcesById = useStore((s) => s.sourcesById)
  const sourcesInView = useStore((s) => s.sourcesInView)
  const placesOverlay = useStore((s) => s.placesOverlay)
  const setPlacesOverlay = useStore((s) => s.setPlacesOverlay)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const recent = loadRecentCityIds()
    .map((id) => sourcesById.get(id))
    .filter((s): s is Source => s != null)

  // The place most of the trees in view come from, shown as the button's tooltip.
  const mainSourceId = Object.entries(sourcesInView).sort((a, b) => b[1] - a[1])[0]?.[0]
  const mainSource = mainSourceId ? sourcesById.get(mainSourceId) : undefined

  function choose(action: () => void) {
    action()
    setOpen(false)
  }

  return (
    <div ref={ref} className="absolute top-[116px] right-2 z-[1000]">
      <button
        onClick={() => setOpen((o) => !o)}
        className={[
          'rounded-full p-2 shadow-md transition-colors',
          placesOverlay ? 'bg-gray-100 text-green-700' : 'bg-white text-gray-700 hover:bg-gray-50',
        ].join(' ')}
        title={mainSource ? `${t('city.choose')} · ${mainSource.name}` : t('city.choose')}
      >
        <Signpost className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-full top-0 mr-1 min-w-max bg-white rounded-lg shadow-lg overflow-hidden">
          <button
            onClick={() => choose(placesOverlay ? () => setPlacesOverlay(false) : onAllPlaces)}
            className="block w-full text-left px-4 py-2 text-sm whitespace-nowrap text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {placesOverlay ? t('city.hidePlaces') : t('city.allPlaces')}
          </button>
          {recent.length > 0 && (
            <div className="border-t">
              {recent.map((s) => (
                <button
                  key={s.id}
                  onClick={() => choose(() => onPlace(s))}
                  className={[
                    'block w-full text-left px-4 py-2 text-sm whitespace-nowrap transition-colors',
                    s.id === mainSourceId
                      ? 'font-semibold text-gray-900 bg-gray-50'
                      : 'text-gray-700 hover:bg-gray-50',
                  ].join(' ')}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
