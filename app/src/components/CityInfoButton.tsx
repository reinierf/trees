import { Info } from 'lucide-react'
import { useStore, PopupKind } from '../store'

interface Props {
  citiesCount: number
}

export function CityInfoButton({ citiesCount }: Props) {
  const popupView = useStore((s) => s.popupView)
  const openCityInfo = useStore((s) => s.openCityInfo)
  const closePopup = useStore((s) => s.closePopup)

  const isActive = popupView?.kind === PopupKind.CityInfo

  return (
    <button
      onClick={isActive ? closePopup : openCityInfo}
      title="Stad info"
      className={[
        'absolute z-[1000] rounded-full p-2 shadow-md transition-colors',
        citiesCount > 1 ? 'top-[300px]' : 'top-[264px]',
        'left-[12px]',
        isActive ? 'bg-gray-100 text-blue-600' : 'bg-white text-gray-700 hover:bg-gray-50',
      ].join(' ')}
    >
      <Info className="w-4 h-4" />
    </button>
  )
}
