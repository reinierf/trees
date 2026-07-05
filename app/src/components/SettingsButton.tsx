import { GraduationCap, Leaf, Settings } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { LOCALES, LOCALE_LABELS } from '../translations/locale'
import { useT } from '../translations/useT'

export function SettingsButton() {
  const t = useT()
  const locale = useStore((s) => s.locale)
  const setLocale = useStore((s) => s.setLocale)
  const nameMode = useStore((s) => s.nameMode)
  const setNameMode = useStore((s) => s.setNameMode)
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

  const rowClass = (active: boolean) =>
    [
      'flex items-center gap-3 w-full text-left px-4 py-2 text-sm whitespace-nowrap transition-colors',
      active ? 'font-semibold text-gray-900 bg-gray-50' : 'text-gray-700 hover:bg-gray-50',
    ].join(' ')

  return (
    <div ref={ref} className="fixed top-[152px] right-2 z-[1000]">
      <button
        onClick={() => setOpen((o) => !o)}
        title={t('settings.title')}
        className={[
          'flex items-center justify-center rounded-full w-8 h-8 shadow-md transition-colors',
          open ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-700 hover:bg-gray-50',
        ].join(' ')}
      >
        <Settings className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 min-w-max bg-white rounded-lg shadow-lg overflow-hidden">
          {LOCALES.map((l) => (
            <button key={l} onClick={() => setLocale(l)} className={rowClass(l === locale)}>
              <span className="text-xs font-bold text-muted-foreground w-5">{l.toUpperCase()}</span>
              <span className="flex-1">{LOCALE_LABELS[l]}</span>
              {l === locale && <span className="text-green-600 text-xs">✓</span>}
            </button>
          ))}
          <div className="border-t" />
          <button onClick={() => setNameMode('scientific')} className={rowClass(nameMode === 'scientific')}>
            <GraduationCap size={14} className="w-5 text-muted-foreground shrink-0" />
            <span className="flex-1">{t('nameMode.scientific')}</span>
            {nameMode === 'scientific' && <span className="text-green-600 text-xs">✓</span>}
          </button>
          <button onClick={() => setNameMode('vernacular')} className={rowClass(nameMode === 'vernacular')}>
            <Leaf size={14} className="w-5 text-muted-foreground shrink-0" />
            <span className="flex-1">{t('nameMode.vernacular')}</span>
            {nameMode === 'vernacular' && <span className="text-green-600 text-xs">✓</span>}
          </button>
        </div>
      )}
    </div>
  )
}
