import { ChevronRight, GraduationCap, Info, Leaf } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { capitalize, capitalizeFirst } from '../../lib/utils'
import { useStore } from '../../store'
import { loadPreference, savePreference } from '../../lib/preferencesStorage'
import { CloseButton, PopupShell } from '../InfoPopup'

let savedScroll = 0
let savedKey = ''

const NAME_MODE_KEY = 'species-name-mode'

interface Props {
  expandedSpecies?: string
  selectedTreeId?: string
  onCenter: (lat: number, lon: number) => void
}

export function SpeciesListPanel({ expandedSpecies, selectedTreeId }: Props) {
  const visibleTrees = useStore((s) => s.visibleTrees)
  const selectTreeInList = useStore((s) => s.selectTreeInList)
  const openTreeDetail = useStore((s) => s.openTreeDetail)
  const closePopup = useStore((s) => s.closePopup)

  const [openSpecies, setOpenSpecies] = useState<string | null>(expandedSpecies ?? null)
  const [nameMode, setNameMode] = useState<'scientific' | 'indigenous'>(
    loadPreference(NAME_MODE_KEY, 'scientific' as const),
  )

  const scrollRef = useRef<HTMLDivElement>(null)
  const selectedRowRef = useRef<HTMLDivElement>(null)

  const speciesList = useMemo(() => {
    const counts = new Map<string, number>()
    for (const tree of visibleTrees) {
      const key = tree.species_binomial ?? tree.species
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const indigenous = new Map<string, string | null>()
    for (const tree of visibleTrees) {
      const key = tree.species_binomial ?? tree.species
      if (!indigenous.has(key)) indigenous.set(key, tree.name_indigenous)
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count, nameIndigenous: indigenous.get(name) ?? null }))
      .sort((a, b) => a.count - b.count || a.name.localeCompare(b.name))
  }, [visibleTrees])

  const listKey = speciesList.map((s) => s.name).join('|')

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = listKey === savedKey ? savedScroll : 0
    }
    selectedRowRef.current?.scrollIntoView({ block: 'center' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleClose() {
    if (scrollRef.current) {
      savedScroll = scrollRef.current.scrollTop
      savedKey = listKey
    }
    savePreference(NAME_MODE_KEY, nameMode)
    closePopup()
  }

  function toggleSpecies(name: string) {
    setOpenSpecies((prev) => (prev === name ? null : name))
  }

  const treesBySpecies = useMemo(() => {
    const map = new Map<string, typeof visibleTrees>()
    for (const tree of visibleTrees) {
      const key = tree.species_binomial ?? tree.species
      const list = map.get(key) ?? []
      list.push(tree)
      map.set(key, list)
    }
    for (const [key, list] of map) {
      map.set(
        key,
        list.sort(
          (a, b) =>
            capitalize(a.street).localeCompare(capitalize(b.street)) ||
            (Number(b.year_planted) || 0) - (Number(a.year_planted) || 0),
        ),
      )
    }
    return map
  }, [visibleTrees])

  return (
    <PopupShell>
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <p className="font-semibold text-sm">
          Species in view{' '}
          <span className="text-muted-foreground font-normal">({speciesList.length})</span>
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded overflow-hidden">
            <button
              title="Scientific names"
              onClick={() => setNameMode('scientific')}
              className={`p-1 ${nameMode === 'scientific' ? 'bg-gray-100 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <GraduationCap size={15} />
            </button>
            <button
              title="Indigenous names"
              onClick={() => setNameMode('indigenous')}
              className={`p-1 ${nameMode === 'indigenous' ? 'bg-gray-100 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Leaf size={15} />
            </button>
          </div>
          <CloseButton onClick={handleClose} />
        </div>
      </div>
      <div ref={scrollRef} className="overflow-y-auto max-h-[60vh] border-t">
        {speciesList.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">No trees in view</p>
        ) : (
          speciesList.map(({ name, count, nameIndigenous }) => {
            const isOpen = openSpecies === name
            const trees = treesBySpecies.get(name) ?? []
            const displayName = nameMode === 'indigenous' && nameIndigenous ? nameIndigenous : name

            return (
              <div key={name}>
                <button
                  onClick={() => toggleSpecies(name)}
                  title={nameIndigenous
                    ? (nameMode === 'scientific' ? capitalizeFirst(nameIndigenous) : capitalizeFirst(name))
                    : undefined}
                  className={`flex items-center justify-between w-full px-4 py-2 text-sm hover:bg-gray-50 text-left ${isOpen ? 'sticky top-0 z-10 bg-white border-b' : ''}`}
                >
                  <span className={`${nameMode === 'scientific' ? 'italic' : ''} ${isOpen ? 'font-semibold' : ''} min-w-0 truncate pr-1`}>{capitalizeFirst(displayName)}</span>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-muted-foreground text-xs">{count}</span>
                    <ChevronRight
                      size={14}
                      className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`}
                    />
                  </div>
                </button>
                {isOpen && (
                  <div className="bg-gray-50 border-t border-b">
                    {trees.map((tree, i) => {
                      const isSelected = tree.id === selectedTreeId
                      const ordinal = i + 1
                      return (
                        <div
                          key={tree.id}
                          ref={isSelected ? selectedRowRef : null}
                          className={`flex items-center w-full pr-2 text-sm ${isSelected ? 'bg-blue-100 border-l-2 border-blue-500' : ''}`}
                        >
                          <button
                            onClick={() => selectTreeInList(tree.id)}
                            className={`flex-1 flex items-center justify-between py-1.5 text-left min-w-0 ${isSelected ? 'pl-5 font-semibold text-blue-900 hover:bg-blue-200' : 'pl-6 hover:bg-gray-100'}`}
                          >
                            <span className="flex items-center gap-1 min-w-0">
                              <span className={`w-5 text-right shrink-0 text-xs font-mono ${isSelected ? 'text-blue-500' : 'text-muted-foreground'}`}>
                                {ordinal}.
                              </span>
                              <span className="min-w-0 truncate">{capitalize(tree.street)}</span>
                            </span>
                            {tree.year_planted && (
                              <span className={`text-xs ml-3 shrink-0 ${isSelected ? 'text-blue-700' : 'text-muted-foreground'}`}>
                                {tree.year_planted}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => openTreeDetail(tree)}
                            className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground"
                            aria-label="Open tree detail"
                          >
                            <Info size={13} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </PopupShell>
  )
}
