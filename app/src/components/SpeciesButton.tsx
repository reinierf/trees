import { Trees } from 'lucide-react'
import { useStore } from '../store'

interface Props {
  citiesCount: number
}

export function SpeciesButton({ citiesCount }: Props) {
  const popupView = useStore((s) => s.popupView)
  const openSpeciesList = useStore((s) => s.openSpeciesList)
  const closePopup = useStore((s) => s.closePopup)
  const tooZoomedOut = useStore((s) => s.tooZoomedOut)

  function toggle() {
    if (popupView?.kind === 'species-list') {
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
      title="Species in view"
      className={[
        'absolute z-[1000] rounded-full p-2 shadow-md transition-colors',
        citiesCount > 1 ? 'top-[156px]' : 'top-[120px]',
        'left-[12px]',
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
