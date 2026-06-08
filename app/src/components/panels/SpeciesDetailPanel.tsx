import { useRef, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { capitalizeFirst, capitalize } from '../../lib/utils'
import { useStore } from '../../store'
import { PopupShell, CloseButton } from '../InfoPopup'

interface Props {
  species: string
  onCenter: (lat: number, lon: number) => void
}

export function SpeciesDetailPanel({ species, onCenter }: Props) {
  const visibleTrees = useStore((s) => s.visibleTrees)
  const openSpeciesList = useStore((s) => s.openSpeciesList)
  const openTreeDetail = useStore((s) => s.openTreeDetail)
  const closePopup = useStore((s) => s.closePopup)

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [species])

  const trees = visibleTrees
    .filter((t) => (t.species_binomial ?? t.species) === species)
    .sort(
      (a, b) =>
        capitalize(a.street).localeCompare(capitalize(b.street)) ||
        (Number(b.year_planted) || 0) - (Number(a.year_planted) || 0),
    )

  return (
    <PopupShell>
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <div className="flex items-center gap-1 min-w-0">
          <button
            onClick={openSpeciesList}
            className="text-muted-foreground hover:text-foreground shrink-0 -ml-1"
            aria-label="Back to species list"
          >
            <ChevronLeft size={16} />
          </button>
          <p className="font-semibold text-sm italic truncate">{capitalizeFirst(species)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-muted-foreground text-xs">{trees.length}</span>
          <CloseButton onClick={closePopup} />
        </div>
      </div>
      <div ref={scrollRef} className="overflow-y-auto max-h-[60vh] border-t">
        {trees.map((tree) => (
          <button
            key={tree.id}
            onClick={() => { openTreeDetail(tree, species); onCenter(tree.lat, tree.lon) }}
            className="flex items-center justify-between w-full px-4 py-2 text-sm hover:bg-gray-50 text-left"
          >
            <span className="min-w-0 truncate">{capitalize(tree.street)}</span>
            {tree.year_planted && (
              <span className="text-muted-foreground text-xs ml-3 shrink-0">
                {tree.year_planted}
              </span>
            )}
          </button>
        ))}
      </div>
    </PopupShell>
  )
}
