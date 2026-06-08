import { useMemo, useRef, useEffect } from 'react'
import { capitalizeFirst } from '../../lib/utils'
import { useStore } from '../../store'
import { PopupShell, CloseButton } from '../InfoPopup'

let savedScroll = 0
let savedKey = ''

export function SpeciesListPanel() {
  const visibleTrees = useStore((s) => s.visibleTrees)
  const openSpeciesDetail = useStore((s) => s.openSpeciesDetail)
  const closePopup = useStore((s) => s.closePopup)

  const scrollRef = useRef<HTMLDivElement>(null)

  const speciesList = useMemo(() => {
    const counts = new Map<string, number>()
    for (const tree of visibleTrees) {
      const key = tree.species_binomial ?? tree.species
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.count - b.count || a.name.localeCompare(b.name))
  }, [visibleTrees])

  const listKey = speciesList.map((s) => s.name).join('|')

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = listKey === savedKey ? savedScroll : 0
  }, [listKey])

  function handleClose() {
    if (scrollRef.current) {
      savedScroll = scrollRef.current.scrollTop
      savedKey = listKey
    }
    closePopup()
  }

  return (
    <PopupShell>
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <p className="font-semibold text-sm">
          Species in view{' '}
          <span className="text-muted-foreground font-normal">({speciesList.length})</span>
        </p>
        <CloseButton onClick={handleClose} />
      </div>
      <div ref={scrollRef} className="overflow-y-auto max-h-[60vh] border-t">
        {speciesList.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">No trees in view</p>
        ) : (
          speciesList.map(({ name, count }) => (
            <button
              key={name}
              onClick={() => openSpeciesDetail(name)}
              className="flex items-center justify-between w-full px-4 py-2 text-sm hover:bg-gray-50 text-left"
            >
              <span className="italic min-w-0 truncate">{capitalizeFirst(name)}</span>
              <span className="text-muted-foreground text-xs ml-3 shrink-0">{count}</span>
            </button>
          ))
        )}
      </div>
    </PopupShell>
  )
}
