import { ChevronRight, Filter, Info } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { capitalize, capitalizeFirst } from '../../lib/utils'
import { formatVernacular, useSpeciesNames } from '../../lib/species'
import { treeKey } from '../../lib/treeKey'
import { useSpeciesInView } from '../../api/useSpeciesInView'
import { useTreesDetails } from '../../api/useTreeDetails'
import { useStore } from '../../store'
import type { Tree, TreeDetails } from '../../types'
import { CloseButton, CollapseButton, PopupShell } from '../InfoPopup'
import { useT } from '../../translations/useT'

let savedScroll = 0
let savedKey = ''

function treeLocation(details: TreeDetails | undefined) {
  return details?.street ?? details?.neighbourhood ?? ''
}

interface Props {
  expandedSpecies?: number
  selectedTreeKey?: string
}

export function SpeciesListPanel({ expandedSpecies, selectedTreeKey }: Props) {
  const t = useT()
  const visibleTrees = useStore((s) => s.visibleTrees)
  const allTreeMode = useStore((s) => s.allTreeMode)
  const selectTreeInList = useStore((s) => s.selectTreeInList)
  const openTreeDetail = useStore((s) => s.openTreeDetail)
  const closePopup = useStore((s) => s.closePopup)
  const setPendingSpeciesSelect = useStore((s) => s.setPendingSpeciesSelect)
  const nameMode = useStore((s) => s.nameMode)
  const names = useSpeciesNames()

  const [openSpecies, setOpenSpecies] = useState<number | null>(expandedSpecies ?? null)
  const [collapsed, setCollapsed] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const selectedRowRef = useRef<HTMLDivElement>(null)

  const inView = useSpeciesInView(true)
  const speciesList = useMemo(() => {
    if (!inView) return null
    return inView
      .map(({ speciesId, count }) => ({ speciesId, count, names: names(speciesId) }))
      .sort((a, b) => a.count - b.count || a.names.key.localeCompare(b.names.key))
  }, [inView, names])

  const listKey = speciesList?.map((s) => s.speciesId).join('|') ?? ''

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

  function toggleSpecies(speciesId: number) {
    setOpenSpecies((prev) => (prev === speciesId ? null : speciesId))
  }

  // Individual trees are only known where the map shows them as trees, not as server clusters.
  const openTrees = useMemo(
    () => (openSpecies === null ? [] : visibleTrees.filter((tree) => tree.speciesId === openSpecies)),
    [visibleTrees, openSpecies],
  )
  const details = useTreesDetails(openTrees)
  const sortedOpenTrees = useMemo(() => {
    const byLocation = (tree: Tree) => capitalize(treeLocation(details.get(treeKey(tree))))
    const year = (tree: Tree) => Number(details.get(treeKey(tree))?.year_planted) || 0
    return openTrees.slice().sort((a, b) => byLocation(a).localeCompare(byLocation(b)) || year(b) - year(a))
  }, [openTrees, details])

  return (
    <PopupShell>
      <div className="flex items-center justify-between px-4 py-3">
        <p className="font-semibold text-sm">
          {t('species.title')}{' '}
          {speciesList && <span className="text-muted-foreground font-normal">({speciesList.length})</span>}
        </p>
        <div className="flex items-center gap-2">
          <CollapseButton collapsed={collapsed} onClick={() => setCollapsed((c) => !c)} />
          <CloseButton onClick={handleClose} />
        </div>
      </div>
      {!collapsed && <div ref={scrollRef} className="overflow-y-auto max-h-[60vh] border-t">
        {speciesList === null ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{t('search.loading')}</p>
        ) : speciesList.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{t('species.empty')}</p>
        ) : (
          speciesList.map(({ speciesId, count, names: n }) => {
            const isOpen = openSpecies === speciesId
            const vernacular = n.vernacular ? formatVernacular(n.vernacular) : null
            const displayName = nameMode === 'vernacular' && vernacular ? vernacular : capitalizeFirst(n.key)

            return (
              <div key={speciesId}>
                <div className={`flex items-center w-full text-sm hover:bg-gray-50 ${isOpen ? 'sticky top-0 z-10 bg-white border-b' : ''}`}>
                  <button
                    onClick={() => toggleSpecies(speciesId)}
                    title={vernacular
                      ? (nameMode === 'scientific' ? vernacular : capitalizeFirst(n.key))
                      : undefined}
                    className="flex-1 flex items-center justify-between px-4 py-2 text-left min-w-0"
                  >
                    <span className={`${nameMode === 'scientific' ? 'italic' : ''} ${isOpen ? 'font-semibold' : ''} min-w-0 truncate pr-1`}>{displayName}</span>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-muted-foreground text-xs">{count}</span>
                      <ChevronRight
                        size={14}
                        className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`}
                      />
                    </div>
                  </button>
                  <button
                    onClick={() => { setPendingSpeciesSelect(speciesId); closePopup() }}
                    className="shrink-0 p-1.5 pr-3 text-muted-foreground hover:text-foreground"
                    aria-label={t('species.filterBy')}
                    title={t('species.showAllOnMap')}
                  >
                    <Filter size={13} />
                  </button>
                </div>
                {isOpen && (
                  <div className="bg-gray-50 border-t border-b">
                    {!allTreeMode && (
                      <p className="px-6 py-1.5 text-xs text-muted-foreground">{t('species.zoomInForTrees')}</p>
                    )}
                    {sortedOpenTrees.map((tree, i) => {
                      const key = treeKey(tree)
                      const d = details.get(key)
                      const isSelected = key === selectedTreeKey
                      return (
                        <div
                          key={key}
                          ref={isSelected ? selectedRowRef : null}
                          className={`flex items-center w-full pr-2 text-sm ${isSelected ? 'bg-blue-100 border-l-2 border-blue-500' : ''}`}
                        >
                          <button
                            onClick={() => selectTreeInList(key)}
                            className={`flex-1 flex items-center justify-between py-1.5 text-left min-w-0 ${isSelected ? 'pl-5 font-semibold text-blue-900 hover:bg-blue-200' : 'pl-6 hover:bg-gray-100'}`}
                          >
                            <span className="flex items-center gap-1 min-w-0">
                              <span className={`w-5 text-right shrink-0 text-xs font-mono ${isSelected ? 'text-blue-500' : 'text-muted-foreground'}`}>
                                {i + 1}.
                              </span>
                              <span className="min-w-0 truncate">{d ? capitalize(treeLocation(d)) : '…'}</span>
                            </span>
                            {d?.year_planted && (
                              <span className={`text-xs ml-3 shrink-0 ${isSelected ? 'text-blue-700' : 'text-muted-foreground'}`}>
                                {d.year_planted}
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
