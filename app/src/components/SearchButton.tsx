import { Search } from 'lucide-react'

interface Props {
  citiesCount: number
  onClick: () => void
  active: boolean
}

export function SearchButton({ citiesCount, onClick, active }: Props) {
  return (
    <button
      onClick={onClick}
      title="Zoek op soort"
      className={[
        'absolute z-[1000] rounded-full p-2 shadow-md transition-colors',
        citiesCount > 1 ? 'top-[192px]' : 'top-[156px]',
        'left-[12px]',
        active
          ? 'bg-gray-100 text-green-700'
          : 'bg-white text-gray-700 hover:bg-gray-50',
      ].join(' ')}
    >
      <Search className="w-4 h-4" />
    </button>
  )
}
