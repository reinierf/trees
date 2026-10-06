import { Info } from 'lucide-react'
import { useStore, PopupKind } from '../store'
import { useT } from '../translations/useT'

export function SourcesButton() {
  const t = useT()
  const popupView = useStore((s) => s.popupView)
  const openSources = useStore((s) => s.openSources)
  const closePopup = useStore((s) => s.closePopup)
  const placesOverlay = useStore((s) => s.placesOverlay)

  const isActive = popupView?.kind === PopupKind.Sources

  return (
    <button
      onClick={isActive ? closePopup : openSources}
      disabled={placesOverlay}
      title={t('sources.title')}
      className={[
        'absolute z-[1000] rounded-full p-2 shadow-md transition-colors disabled:opacity-50 disabled:pointer-events-none',
        'top-[156px] left-[12px]',
        isActive ? 'bg-gray-100 text-blue-600' : 'bg-white text-gray-700 hover:bg-gray-50',
      ].join(' ')}
    >
      <Info className="w-4 h-4" />
    </button>
  )
}
