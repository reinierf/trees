import { Heart } from 'lucide-react'
import { useStore } from '../store'

interface Props {
  citiesCount: number
}

export function FavouritesButton({ citiesCount }: Props) {
  const popupView = useStore((s) => s.popupView)
  const openFavourites = useStore((s) => s.openFavourites)
  const closePopup = useStore((s) => s.closePopup)
  const favourites = useStore((s) => s.favourites)

  const totalFavs = Object.values(favourites).reduce((sum, trees) => sum + trees.length, 0)
  const isActive =
    popupView?.kind === 'favourites' ||
    (popupView?.kind === 'tree-detail' && popupView.returnTo === 'favourites')

  function toggle() {
    if (isActive) closePopup()
    else openFavourites()
  }

  const title = totalFavs > 0 ? `Favorieten (${totalFavs})` : 'Favorieten'

  return (
    <button
      onClick={toggle}
      title={title}
      className={[
        'absolute z-[1000] rounded-full p-2 shadow-md transition-colors',
        citiesCount > 1 ? 'top-[228px]' : 'top-[192px]',
        'left-[12px]',
        isActive ? 'bg-gray-100 text-red-500' : 'bg-white text-gray-700 hover:bg-gray-50',
      ].join(' ')}
    >
      <Heart className={`w-4 h-4 ${isActive ? 'fill-red-400' : ''}`} />
    </button>
  )
}
