import { Trees } from 'lucide-react'
import { useStore, PopupKind } from '../store'
import { useT } from '../translations/useT'

export function SpeciesButton() {
  const t = useT()
  const popupView = useStore((s) => s.popupView)
  const openSpeciesList = useStore((s) => s.openSpeciesList)
  const closePopup = useStore((s) => s.closePopup)
  const tooZoomedOut = useStore((s) => s.tooZoomedOut)

  function toggle() {
    if (popupView?.kind === PopupKind.SpeciesList) {
      closePopup()
    } else {
      openSpeciesList()
    }
  }

  const isActive = popupView !== null

  return (
    <button
      onClick={toggle}
      disabled={tooZoomedOut}
      title={t('species.title')}
      className={[
        'absolute z-[1000] rounded-full p-2 shadow-md transition-colors',
        'top-[84px] left-[12px]',
        tooZoomedOut
          ? 'bg-white text-gray-300 cursor-default'
          : isActive
            ? 'bg-gray-100 text-green-700'
            : 'bg-white text-gray-700 hover:bg-gray-50',
      ].join(' ')}
    >
      <Trees className="w-4 h-4" />
    </button>
  )
}
