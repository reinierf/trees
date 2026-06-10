import { X } from 'lucide-react'
import { useStore } from '../store'
import { capitalizeFirst } from '../lib/utils'
import { loadPreference } from '../lib/preferencesStorage'

const NAME_MODE_KEY = 'species-name-mode'

interface Props {
  onClear: () => void
}

export function SpeciesFilterBadge({ onClear }: Props) {
  const speciesFilter = useStore((s) => s.speciesFilter)
  const citySpecies = useStore((s) => s.citySpecies)
  const visibleTrees = useStore((s) => s.visibleTrees)
  const isLoadingSpeciesFilter = useStore((s) => s.isLoadingSpeciesFilter)

  if (!speciesFilter && !isLoadingSpeciesFilter) return null

  const nameMode = loadPreference<'scientific' | 'indigenous'>(NAME_MODE_KEY, 'scientific')
  const speciesItem = citySpecies.find(
    (s) => (s.species_binomial ?? s.species) === speciesFilter,
  )

  const displayName = speciesFilter
    ? nameMode === 'indigenous' && speciesItem?.name_indigenous
      ? capitalizeFirst(speciesItem.name_indigenous)
      : capitalizeFirst(speciesFilter)
    : ''

  return (
    <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-white/95 backdrop-blur-sm px-3 py-2 rounded-full shadow-lg text-sm max-w-[calc(100vw-8rem)] pointer-events-auto">
      {isLoadingSpeciesFilter ? (
        <span className="text-gray-500">Bomen laden…</span>
      ) : (
        <>
          <span
            className={`truncate ${nameMode === 'scientific' ? 'italic' : ''}`}
            title={speciesFilter ?? undefined}
          >
            {displayName}
          </span>
          <span className="text-gray-400 shrink-0">
            {visibleTrees.length.toLocaleString('nl-NL')} bomen
          </span>
          <button
            onClick={onClear}
            className="text-gray-400 hover:text-gray-700 shrink-0 -mr-0.5"
            aria-label="Filter wissen"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  )
}
