import { useMemo, useState } from 'react'
import { ChevronRight, Info } from 'lucide-react'
import { capitalize } from '../../lib/utils'
import { displayName, useSpeciesNames } from '../../lib/species'
import { treeKey } from '../../lib/treeKey'
import type { FavouriteTree } from '../../lib/favouritesStorage'
import { useStore, PopupKind } from '../../store'
import { CloseButton, CollapseButton, PopupShell } from '../InfoPopup'
import { useT } from '../../translations/useT'
import { intlTag } from '../../translations/locale'

// Zoom to fly to when a favourite is picked from the list: close enough to see the tree itself.
const FAVOURITE_MIN_ZOOM = 17

export function FavouritesPanel() {
  const t = useT()
  const favourites = useStore((s) => s.favourites)
  const sourcesById = useStore((s) => s.sourcesById)
  const sourcesInView = useStore((s) => s.sourcesInView)
  const nameMode = useStore((s) => s.nameMode)
  const locale = useStore((s) => s.locale)
  const setPendingFlyTo = useStore((s) => s.setPendingFlyTo)
  const setPendingHighlight = useStore((s) => s.setPendingHighlight)
  const openTreeDetail = useStore((s) => s.openTreeDetail)
  const closePopup = useStore((s) => s.closePopup)
  const names = useSpeciesNames()

  const all = Object.values(favourites)

  // Grouped by source; sources with trees in view first, then alphabetically.
  const groups = useMemo(() => {
    const bySource = new Map<string, FavouriteTree[]>()
    for (const fav of Object.values(favourites)) {
      const list = bySource.get(fav.source) ?? []
      list.push(fav)
      bySource.set(fav.source, list)
    }
    return [...bySource.entries()]
      .map(([id, trees]) => ({
        id,
        name: sourcesById.get(id)?.name ?? id,
        inView: (sourcesInView[id] ?? 0) > 0,
        trees: trees.sort((a, b) => a.addedAt - b.addedAt),
      }))
      .sort((a, b) => Number(b.inView) - Number(a.inView) || a.name.localeCompare(b.name, intlTag(locale)))
  }, [favourites, sourcesById, sourcesInView, locale])

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(groups.map((g) => g.id)))
  const [collapsed, setCollapsed] = useState(false)

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleRowClick(tree: FavouriteTree) {
    setPendingFlyTo({ lat: tree.lat, lon: tree.lon, minZoom: FAVOURITE_MIN_ZOOM })
    setPendingHighlight(tree)
  }

  return (
    <PopupShell>
      <div className="flex items-center justify-between px-4 py-3">
        <p className="font-semibold text-sm">
          {t('favourites.title')}{' '}
          <span className="text-muted-foreground font-normal">({all.length})</span>
        </p>
        <div className="flex items-center gap-2">
          <CollapseButton collapsed={collapsed} onClick={() => setCollapsed((c) => !c)} />
          <CloseButton onClick={closePopup} />
        </div>
      </div>
      {!collapsed && <div className="overflow-y-auto max-h-[60vh] border-t">
        {groups.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{t('favourites.empty')}</p>
        ) : (
          groups.map((group) => {
            const isOpen = openGroups.has(group.id)
            return (
              <div key={group.id}>
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={`flex items-center justify-between w-full px-4 py-2 text-sm hover:bg-gray-50 text-left ${isOpen ? 'sticky top-0 z-10 bg-white border-b font-semibold' : ''}`}
                >
                  <span>
                    {group.name}{' '}
                    <span className="text-muted-foreground font-normal">({group.trees.length})</span>
                  </span>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <ChevronRight
                      size={14}
                      className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`}
                    />
                  </div>
                </button>
                {isOpen && (
                  <div className="bg-gray-50 border-t border-b">
                    {group.trees.map((tree) => {
                      const n = names(tree.speciesId)
                      const primaryName = displayName(n, nameMode)
                      const titleAttr = n.vernacular
                        ? displayName(n, nameMode === 'scientific' ? 'vernacular' : 'scientific')
                        : undefined

                      return (
                        <div key={treeKey(tree)} className="flex items-center w-full pr-2 text-sm">
                          <button
                            onClick={() => handleRowClick(tree)}
                            title={titleAttr}
                            className="flex-1 flex flex-col items-start py-1.5 pl-4 text-left min-w-0 hover:bg-gray-100"
                          >
                            <span
                              className={`truncate w-full ${nameMode === 'scientific' ? 'italic' : ''}`}
                            >
                              {primaryName}
                            </span>
                            <span className="flex items-center gap-2 w-full min-w-0">
                              <span className="text-xs text-muted-foreground truncate">
                                {tree.street ? capitalize(tree.street) : ''}
                              </span>
                              {tree.year_planted && (
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {tree.year_planted}
                                </span>
                              )}
                            </span>
                          </button>
                          <button
                            onClick={() => openTreeDetail(tree, PopupKind.Favourites)}
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
