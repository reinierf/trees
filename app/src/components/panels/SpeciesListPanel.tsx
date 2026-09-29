import { ChevronRight, Filter, Info, Loader2, Navigation, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { capitalize, capitalizeFirst } from '../../lib/utils'
import { formatVernacular, useSpeciesNames, type SpeciesNames } from '../../lib/species'
import { treeKey } from '../../lib/treeKey'
import { useSpeciesInView } from '../../api/useSpeciesInView'
import { useTreesDetails } from '../../api/useTreeDetails'
import { fetchNearestTree, type NearestTree } from '../../api/trees'
import { NEAREST_TREE_ZOOM } from '../../config'
import { inBounds } from '../../map/mercator'
import { useStore } from '../../store'
import type { Tree, TreeDetails } from '../../types'
import { CloseButton, CollapseButton, PopupShell } from '../InfoPopup'
import { useT } from '../../translations/useT'
import { intlTag } from '../../translations/locale'

let savedScroll = 0
let savedKey = ''

// Species not in view are only listed while searching; more than this and the query is too broad.
const MAX_NOT_IN_VIEW = 50

function treeLocation(details: TreeDetails | undefined) {
  return details?.street ?? details?.neighbourhood ?? ''
}

function formatDistance(metres: number, locale: string): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`
  const km = metres / 1000
  return `${km.toLocaleString(locale, { maximumFractionDigits: km < 10 ? 1 : 0 })} km`
}

function matches(names: SpeciesNames, q: string): boolean {
  return names.key.toUpperCase().includes(q) || (names.vernacular?.toUpperCase().includes(q) ?? false)
}

interface Props {
  expandedSpecies?: number
  selectedTreeKey?: string
  initialQuery?: string
}

export function SpeciesListPanel({ expandedSpecies, selectedTreeKey, initialQuery }: Props) {
  const t = useT()
  const visibleTrees = useStore((s) => s.visibleTrees)
  const allTreeMode = useStore((s) => s.allTreeMode)
  const speciesById = useStore((s) => s.speciesById)
  const selectTreeInList = useStore((s) => s.selectTreeInList)
  const openTreeDetail = useStore((s) => s.openTreeDetail)
  const closePopup = useStore((s) => s.closePopup)
  const setPendingSpeciesSelect = useStore((s) => s.setPendingSpeciesSelect)
  const setPendingTree = useStore((s) => s.setPendingTree)
  const setPendingFlyTo = useStore((s) => s.setPendingFlyTo)
  const clearSpeciesFilter = useStore((s) => s.clearSpeciesFilter)
  const showBackBar = useStore((s) => s.showBackBar)
  const sourcesById = useStore((s) => s.sourcesById)
  const nameMode = useStore((s) => s.nameMode)
  const locale = useStore((s) => s.locale)
  const names = useSpeciesNames()

  const [openSpecies, setOpenSpecies] = useState<number | null>(expandedSpecies ?? null)
  const [collapsed, setCollapsed] = useState(false)
  const [query, setQuery] = useState(initialQuery ?? '')
  const [nearestLoading, setNearestLoading] = useState<number | null>(null)
  // Result of the last nearest-tree lookup, shown under its species row until confirmed.
  const [nearest, setNearest] = useState<{ speciesId: number; tree: NearestTree } | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const selectedRowRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const q = query.trim().toUpperCase()
  const inView = useSpeciesInView(true)
  const speciesList = useMemo(() => {
    if (!inView) return null
    return inView
      .map(({ speciesId, count }) => ({ speciesId, count, names: names(speciesId) }))
      .filter((s) => !q || matches(s.names, q))
      .sort((a, b) => a.count - b.count || a.names.key.localeCompare(b.names.key))
  }, [inView, names, q])

  // While searching, species elsewhere in the country too: reachable through "nearest tree".
  const notInView = useMemo(() => {
    if (!q || !inView) return []
    const inViewIds = new Set(inView.map((s) => s.speciesId))
    const label = (n: SpeciesNames) => (nameMode === 'vernacular' && n.vernacular ? n.vernacular : n.key)
    return [...speciesById.keys()]
      .filter((id) => !inViewIds.has(id))
      .map((id) => ({ speciesId: id, names: names(id) }))
      .filter((s) => matches(s.names, q))
      .sort((a, b) => label(a.names).localeCompare(label(b.names), intlTag(locale)))
  }, [q, inView, speciesById, names, nameMode, locale])

  const listKey = speciesList?.map((s) => s.speciesId).join('|') ?? ''

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = listKey === savedKey ? savedScroll : 0
    }
    selectedRowRef.current?.scrollIntoView({ block: 'center' })
    // Type right away on desktop; on touch screens the keyboard would cover the map.
    if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus()
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

  function filterOn(speciesId: number) {
    setPendingSpeciesSelect(speciesId)
    closePopup()
  }

  // First tap: look up the nearest tree. Already in view → open it right away (no surprise);
  // otherwise show distance and place under the row, and only "Go there" moves the map.
  async function lookUpNearest(speciesId: number) {
    if (nearest?.speciesId === speciesId) { setNearest(null); return }
    const { currentCenter: center, currentBounds: bounds } = useStore.getState()
    if (!center || nearestLoading !== null) return
    setNearestLoading(speciesId)
    try {
      const tree = await fetchNearestTree(speciesId, center[0], center[1])
      if (!tree) return
      if (bounds && inBounds(tree.lat, tree.lon, bounds)) {
        setNearest(null)
        openTreeDetail(tree)
      } else {
        setNearest({ speciesId, tree })
      }
    } catch (e) {
      console.error('fetch nearest tree failed', e)
    } finally {
      setNearestLoading(null)
    }
  }

  function goToNearest(tree: NearestTree) {
    // A filter on another species would hide the tree we're flying to.
    const filter = useStore.getState().speciesFilter
    if (filter !== null && filter !== tree.speciesId) clearSpeciesFilter()
    // Opens the tree's detail panel once its tile has loaded, like a shared tree link.
    setPendingTree({ source: tree.source, id: tree.id })
    setPendingFlyTo({ lat: tree.lat, lon: tree.lon, minZoom: NEAREST_TREE_ZOOM })
    showBackBar()
    setNearest(null)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      // Enter acts on the top row: filter on it, or fly to the nearest tree if it's not in view.
      const first = speciesList?.[0] ?? null
      if (first) filterOn(first.speciesId)
      else if (notInView[0]) void lookUpNearest(notInView[0].speciesId)
    } else if (e.key === 'Escape') {
      if (query) setQuery('')
      else handleClose()
    }
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

  function nameCell(n: SpeciesNames, isOpen = false) {
    const vernacular = n.vernacular ? formatVernacular(n.vernacular) : null
    const shown = nameMode === 'vernacular' && vernacular ? vernacular : capitalizeFirst(n.key)
    return {
      title: vernacular ? (nameMode === 'scientific' ? vernacular : capitalizeFirst(n.key)) : undefined,
      node: (
        <span className={`${nameMode === 'scientific' ? 'italic' : ''} ${isOpen ? 'font-semibold' : ''} min-w-0 truncate pr-1`}>{shown}</span>
      ),
    }
  }

  function nearestButton(speciesId: number) {
    return (
      <button
        onClick={() => void lookUpNearest(speciesId)}
        className="shrink-0 p-1.5 pr-3 text-muted-foreground hover:text-foreground"
        aria-label={t('species.nearest')}
        title={t('species.nearest')}
      >
        {nearestLoading === speciesId
          ? <Loader2 size={13} className="animate-spin" />
          : <Navigation size={13} className={nearest?.speciesId === speciesId ? 'text-green-700' : ''} />}
      </button>
    )
  }

  function nearestResult(speciesId: number) {
    if (nearest?.speciesId !== speciesId) return null
    const { tree } = nearest
    const place = [sourcesById.get(tree.source)?.name ?? tree.source, tree.street ? capitalize(tree.street) : null]
      .filter(Boolean).join(', ')
    return (
      <div className="flex items-center gap-2 pl-6 pr-3 py-1.5 text-xs bg-gray-50 border-y">
        <span className="flex-1 min-w-0 truncate text-muted-foreground" title={place}>
          <span className="font-semibold text-foreground">{formatDistance(tree.distance, intlTag(locale))}</span> · {place}
        </span>
        <button
          onClick={() => goToNearest(tree)}
          className="shrink-0 px-2 py-0.5 rounded bg-[#2d6a4f] text-white hover:bg-[#1e4d38] transition-colors"
        >
          {t('nearest.goThere')}
        </button>
      </div>
    )
  }

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
      {!collapsed && (
        <div className="flex items-center gap-2 mx-3 mb-2 px-2.5 py-1.5 rounded-md border bg-white">
          <Search className="w-3.5 h-3.5 shrink-0 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 min-w-0 text-sm outline-none placeholder:text-gray-400 bg-transparent"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus() }}
              className="text-gray-300 hover:text-gray-500"
              tabIndex={-1}
              aria-label={t('search.clear')}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
      {!collapsed && <div ref={scrollRef} className="overflow-y-auto max-h-[60vh] border-t">
        {speciesList === null ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{t('search.loading')}</p>
        ) : speciesList.length === 0 && notInView.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{q ? t('search.noResults') : t('species.empty')}</p>
        ) : (
          speciesList.map(({ speciesId, count, names: n }) => {
            const isOpen = openSpecies === speciesId
            const name = nameCell(n, isOpen)

            return (
              <div key={speciesId}>
                <div className={`flex items-center w-full text-sm hover:bg-gray-50 ${isOpen ? 'sticky top-0 z-10 bg-white border-b' : ''}`}>
                  <button
                    onClick={() => toggleSpecies(speciesId)}
                    title={name.title}
                    className="flex-1 flex items-center justify-between pl-4 pr-1 py-2 text-left min-w-0"
                  >
                    {name.node}
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-muted-foreground text-xs">{count}</span>
                      <ChevronRight
                        size={14}
                        className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`}
                      />
                    </div>
                  </button>
                  <button
                    onClick={() => filterOn(speciesId)}
                    className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground"
                    aria-label={t('species.filterBy')}
                    title={t('species.showAllOnMap')}
                  >
                    <Filter size={13} />
                  </button>
                  {nearestButton(speciesId)}
                </div>
                {nearestResult(speciesId)}
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
        {notInView.length > 0 && (
          <>
            <p className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-gray-50 border-y">
              {t('species.notInView')}
            </p>
            {notInView.slice(0, MAX_NOT_IN_VIEW).map(({ speciesId, names: n }) => {
              const name = nameCell(n)
              return (
                <div key={speciesId}>
                  <div className="flex items-center w-full text-sm hover:bg-gray-50">
                    <span title={name.title} className="flex-1 flex items-center pl-4 pr-1 py-2 min-w-0">{name.node}</span>
                    {nearestButton(speciesId)}
                  </div>
                  {nearestResult(speciesId)}
                </div>
              )
            })}
            {notInView.length > MAX_NOT_IN_VIEW && (
              <p className="px-4 py-2 text-xs text-muted-foreground text-center border-t">{t('search.typeMore')}</p>
            )}
          </>
        )}
      </div>}
    </PopupShell>
  )
}
