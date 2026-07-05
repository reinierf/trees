import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { LOCALES, LOCALE_LABELS } from '../translations/locale'

export function LanguageButton() {
  const locale = useStore((s) => s.locale)
  const setLocale = useStore((s) => s.setLocale)
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

  return (
    <div ref={ref} className="fixed top-[152px] right-2 z-[1000]">
      <button
        onClick={() => setOpen((o) => !o)}
        title={LOCALE_LABELS[locale]}
        className={[
          'flex items-center justify-center rounded-full w-8 h-8 shadow-md transition-colors text-[10px] font-bold leading-none',
          open ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-700 hover:bg-gray-50',
        ].join(' ')}
      >
        {locale.toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 min-w-max bg-white rounded-lg shadow-lg overflow-hidden">
          {LOCALES.map((l) => (
            <button
              key={l}
              onClick={() => { setLocale(l); setOpen(false) }}
              className={[
                'flex items-center gap-3 w-full text-left px-4 py-2 text-sm whitespace-nowrap transition-colors',
                l === locale ? 'font-semibold text-gray-900 bg-gray-50' : 'text-gray-700 hover:bg-gray-50',
              ].join(' ')}
            >
              <span className="text-xs font-bold text-muted-foreground w-5">{l.toUpperCase()}</span>
              <span className="flex-1">{LOCALE_LABELS[l]}</span>
              {l === locale && <span className="text-green-600 text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
