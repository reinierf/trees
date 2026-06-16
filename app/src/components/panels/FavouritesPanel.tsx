import { useState } from 'react'
import { ChevronRight, Info } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { capitalize, capitalizeFirst } from '../../lib/utils'
import { useStore, PopupKind } from '../../store'
import { CloseButton, CollapseButton, PopupShell } from '../InfoPopup'
import { NameModeToggle } from '../NameModeToggle'
import type { City, Tree } from '../../types'

interface Props {
  cities: City[]
  currentCityId: string
}

export function FavouritesPanel({ cities, currentCityId }: Props) {
  const favourites = useStore((s) => s.favourites)
  const nameMode = useStore((s) => s.nameMode)
  const setPendingCenter = useStore((s) => s.setPendingCenter)
  const setPendingHighlight = useStore((s) => s.setPendingHighlight)
  const openTreeDetail = useStore((s) => s.openTreeDetail)
  const closePopup = useStore((s) => s.closePopup)
  const navigate = useNavigate()

  const totalFavs = Object.values(favourites).reduce((sum, trees) => sum + trees.length, 0)

  const citiesWithFavs = cities
    .filter((c) => (favourites[c.id]?.length ?? 0) > 0)
    .sort((a, b) => {
      if (a.id === currentCityId) return -1
      if (b.id === currentCityId) return 1
      return a.name.localeCompare(b.name, 'nl')
    })

  const [openCities, setOpenCities] = useState<Set<string>>(
    () => new Set(citiesWithFavs.map((c) => c.id)),
  )
  const [collapsed, setCollapsed] = useState(false)

  function toggleCity(cityId: string) {
    setOpenCities((prev) => {
      const next = new Set(prev)
      if (next.has(cityId)) next.delete(cityId)
      else next.add(cityId)
      return next
    })
  }

  function handleRowClick(cityId: string, tree: Tree) {
    if (cityId !== currentCityId) navigate(`/${cityId}`)
    setPendingCenter([tree.lat, tree.lon])
    setPendingHighlight(tree)
  }

  return (
    <PopupShell>
      <div className="flex items-center justify-between px-4 py-3">
        <p className="font-semibold text-sm">
          Favorieten{' '}
          <span className="text-muted-foreground font-normal">({totalFavs})</span>
        </p>
        <div className="flex items-center gap-2">
          <NameModeToggle />
          <CollapseButton collapsed={collapsed} onClick={() => setCollapsed((c) => !c)} />
          <CloseButton onClick={closePopup} />
        </div>
      </div>
      {!collapsed && <div className="overflow-y-auto max-h-[60vh] border-t">
        {citiesWithFavs.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">Geen favorieten</p>
        ) : (
          citiesWithFavs.map((city) => {
            const trees = favourites[city.id] ?? []
            const isOpen = openCities.has(city.id)

            return (
              <div key={city.id}>
                <button
                  onClick={() => toggleCity(city.id)}
                  className={`flex items-center justify-between w-full px-4 py-2 text-sm hover:bg-gray-50 text-left ${isOpen ? 'sticky top-0 z-10 bg-white border-b font-semibold' : ''}`}
                >
                  <span>
                    {city.name}{' '}
                    <span className="text-muted-foreground font-normal">({trees.length})</span>
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
                    {trees.map((tree) => {
                      const speciesKey = tree.species_binomial ?? tree.species
                      const primaryName =
                        nameMode === 'vernacular' && tree.name_vernacular
                          ? capitalizeFirst(tree.name_vernacular)
                          : capitalizeFirst(speciesKey)
                      const titleAttr = tree.name_vernacular
                        ? nameMode === 'scientific'
                          ? capitalizeFirst(tree.name_vernacular)
                          : capitalizeFirst(speciesKey)
                        : undefined

                      return (
                        <div key={tree.id} className="flex items-center w-full pr-2 text-sm">
                          <button
                            onClick={() => handleRowClick(city.id, tree)}
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
                                {capitalize(tree.street)}
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
                            aria-label="Open boomdetails"
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
