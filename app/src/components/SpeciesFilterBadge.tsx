import { X } from 'lucide-react'
import { useStore } from '../store'
import { displayName, useSpeciesNames } from '../lib/species'
import { useT } from '../translations/useT'
import { intlTag } from '../translations/locale'

interface Props {
  onClear: () => void
}

export function SpeciesFilterBadge({ onClear }: Props) {
  const t = useT()
  const speciesFilter = useStore((s) => s.speciesFilter)
  // Exact when every tile in view holds individual trees; otherwise the tiles' count, which
  // includes their parts just outside the screen.
  const count = useStore((s) => (s.allTreeMode ? s.visibleTrees.length : s.countInView))
  const isLoading = useStore((s) => s.isLoading)
  const nameMode = useStore((s) => s.nameMode)
  const locale = useStore((s) => s.locale)
  const names = useSpeciesNames()

  if (speciesFilter === null) return null
  const n = names(speciesFilter)

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-white/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-md text-sm max-w-[calc(100vw-8rem)] pointer-events-auto">
      <span
        className={`truncate pr-0.5 ${nameMode === 'scientific' ? 'italic' : ''}`}
        title={n.key}
      >
        {displayName(n, nameMode)}
      </span>
      <span className="text-gray-400 shrink-0">
        {isLoading ? t('species.loadingTrees') : `${count.toLocaleString(intlTag(locale))} ${t('marker.trees')}`}
      </span>
      <button
        onClick={onClear}
        className="text-gray-400 hover:text-gray-700 shrink-0 -mr-0.5"
        aria-label={t('species.clearFilter')}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
