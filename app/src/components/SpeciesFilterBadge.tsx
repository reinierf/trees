import { X } from 'lucide-react'
import { useStore } from '../store'
import { capitalizeFirst } from '../lib/utils'
import { useT } from '../translations/useT'
import { intlTag } from '../translations/locale'

interface Props {
  onClear: () => void
}

export function SpeciesFilterBadge({ onClear }: Props) {
  const t = useT()
  const speciesFilter = useStore((s) => s.speciesFilter)
  const citySpecies = useStore((s) => s.citySpecies)
  const visibleTrees = useStore((s) => s.visibleTrees)
  const isLoadingSpeciesFilter = useStore((s) => s.isLoadingSpeciesFilter)
  const nameMode = useStore((s) => s.nameMode)
  const locale = useStore((s) => s.locale)

  if (!speciesFilter && !isLoadingSpeciesFilter) return null
  const speciesItem = citySpecies.find(
    (s) => (s.species_binomial ?? s.species) === speciesFilter,
  )

  const displayName = speciesFilter
    ? nameMode === 'vernacular' && speciesItem?.name_vernacular
      ? capitalizeFirst(speciesItem.name_vernacular)
      : capitalizeFirst(speciesFilter)
    : ''

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-white/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-md text-sm max-w-[calc(100vw-8rem)] pointer-events-auto">
      {isLoadingSpeciesFilter ? (
        <span className="text-gray-500">{t('species.loadingTrees')}</span>
      ) : (
        <>
          <span
            className={`truncate pr-0.5 ${nameMode === 'scientific' ? 'italic' : ''}`}
            title={speciesFilter ?? undefined}
          >
            {displayName}
          </span>
          <span className="text-gray-400 shrink-0">
            {visibleTrees.length.toLocaleString(intlTag(locale))} {t('marker.trees')}
          </span>
          <button
            onClick={onClear}
            className="text-gray-400 hover:text-gray-700 shrink-0 -mr-0.5"
            aria-label={t('species.clearFilter')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  )
}
