import { ChevronRight, Filter, Info } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { capitalize, capitalizeFirst } from '../../lib/utils'
import { useStore } from '../../store'
import type { Tree } from '../../types'
import { CloseButton, CollapseButton, PopupShell } from '../InfoPopup'
import { NameModeToggle } from '../NameModeToggle'
import { useT } from '../../translations/useT'

let savedScroll = 0
let savedKey = ''

function treeLocation(tree: Tree) {
  return tree.street ?? tree.neighbourhood ?? ''
}

interface Props {
  expandedSpecies?: string
  selectedTreeId?: string
}

export function SpeciesListPanel({ expandedSpecies, selectedTreeId }: Props) {
  const t = useT()
  const visibleTrees = useStore((s) => s.visibleTrees)
  const selectTreeInList = useStore((s) => s.selectTreeInList)
  const openTreeDetail = useStore((s) => s.openTreeDetail)
  const closePopup = useStore((s) => s.closePopup)
  const setPendingSpeciesSelect = useStore((s) => s.setPendingSpeciesSelect)

  const [openSpecies, setOpenSpecies] = useState<string | null>(expandedSpecies ?? null)
  const [collapsed, setCollapsed] = useState(false)
  const nameMode = useStore((s) => s.nameMode)

  const scrollRef = useRef<HTMLDivElement>(null)
  const selectedRowRef = useRef<HTMLDivElement>(null)

  const speciesList = useMemo(() => {
    const counts = new Map<string, number>()
    for (const tree of visibleTrees) {
      const key = tree.species_binomial ?? tree.species
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const vernacular = new Map<string, string | null>()
    for (const tree of visibleTrees) {
      const key = tree.species_binomial ?? tree.species
      if (!vernacular.has(key)) vernacular.set(key, tree.name_vernacular)
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count, nameVernacular: vernacular.get(name) ?? null }))
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
            capitalize(treeLocation(a)).localeCompare(capitalize(treeLocation(b))) ||
            (Number(b.year_planted) || 0) - (Number(a.year_planted) || 0),
        ),
      )
    }
    return map
  }, [visibleTrees])

  return (
    <PopupShell>
      <div className="flex items-center justify-between px-4 py-3">
        <p className="font-semibold text-sm">
          {t('species.title')}{' '}
          <span className="text-muted-foreground font-normal">({speciesList.length})</span>
        </p>
        <div className="flex items-center gap-2">
          <NameModeToggle />
          <CollapseButton collapsed={collapsed} onClick={() => setCollapsed((c) => !c)} />
          <CloseButton onClick={handleClose} />
        </div>
      </div>
      {!collapsed && <div ref={scrollRef} className="overflow-y-auto max-h-[60vh] border-t">
        {speciesList.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{t('species.empty')}</p>
        ) : (
          speciesList.map(({ name, count, nameVernacular }) => {
            const isOpen = openSpecies === name
            const trees = treesBySpecies.get(name) ?? []
            const displayName = nameMode === 'vernacular' && nameVernacular ? nameVernacular : name

            return (
              <div key={name}>
                <div className={`flex items-center w-full text-sm hover:bg-gray-50 ${isOpen ? 'sticky top-0 z-10 bg-white border-b' : ''}`}>
                  <button
                    onClick={() => toggleSpecies(name)}
                    title={nameVernacular
                      ? (nameMode === 'scientific' ? capitalizeFirst(nameVernacular) : capitalizeFirst(name))
                      : undefined}
                    className="flex-1 flex items-center justify-between px-4 py-2 text-left min-w-0"
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
                  <button
                    onClick={() => { setPendingSpeciesSelect(name); closePopup() }}
                    className="shrink-0 p-1.5 pr-3 text-muted-foreground hover:text-foreground"
                    aria-label={t('species.filterBy')}
                    title={t('species.showAllOnMap')}
                  >
                    <Filter size={13} />
                  </button>
                </div>
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
                              <span className="min-w-0 truncate">{capitalize(treeLocation(tree))}</span>
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
                            aria-label={t('species.openDetail')}
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
      </div>}
    </PopupShell>
  )
}
