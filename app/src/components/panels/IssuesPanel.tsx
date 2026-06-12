import { useState } from 'react'
import { Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { capitalizeFirst } from '../../lib/utils'
import { useStore } from '../../store'
import { resolveIssue } from '../../api/trees'
import { CloseButton, CollapseButton, PopupShell } from '../InfoPopup'
import { TREE_FLAGS, SPECIES_FLAGS } from '../FlagModal'
import type { City } from '../../types'

const treeFlagLabel   = Object.fromEntries(TREE_FLAGS.map((f) => [f.id, f.label]))
const speciesFlagLabel = Object.fromEntries(SPECIES_FLAGS.map((f) => [f.id, f.label]))

interface Props {
  cities: City[]
  currentCityId: string
}

export function IssuesPanel({ cities, currentCityId }: Props) {
  const treeIssues     = useStore((s) => s.treeIssues)
  const speciesIssues  = useStore((s) => s.speciesIssues)
  const removeTreeIssue    = useStore((s) => s.removeTreeIssue)
  const removeSpeciesIssue = useStore((s) => s.removeSpeciesIssue)
  const setPendingCenter   = useStore((s) => s.setPendingCenter)
  const closePopup         = useStore((s) => s.closePopup)
  const navigate = useNavigate()

  const [collapsed, setCollapsed] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)

  const total = treeIssues.length + speciesIssues.length

  const cityName = (id: string) => cities.find((c) => c.id === id)?.name ?? id

  async function handleResolveTree(city: string, treeId: string) {
    const key = `tree:${city}:${treeId}`
    setResolving(key)
    try {
      await resolveIssue({ type: 'tree', city, treeId })
      removeTreeIssue(city, treeId)
    } finally {
      setResolving(null)
    }
  }

  async function handleResolveSpecies(binomial: string) {
    const key = `species:${binomial}`
    setResolving(key)
    try {
      await resolveIssue({ type: 'species', speciesBinomial: binomial })
      removeSpeciesIssue(binomial)
    } finally {
      setResolving(null)
    }
  }

  function flyToTree(city: string, lat: number | null, lon: number | null) {
    if (!lat || !lon) return
    if (city !== currentCityId) navigate(`/${city}`)
    setPendingCenter([lat, lon])
    closePopup()
  }

  return (
    <PopupShell>
      <div className="flex items-center justify-between px-4 py-3">
        <p className="font-semibold text-sm">
          Datafoutmeldingen{' '}
          <span className="text-muted-foreground font-normal">({total})</span>
        </p>
        <div className="flex items-center gap-2">
          <CollapseButton collapsed={collapsed} onClick={() => setCollapsed((c) => !c)} />
          <CloseButton onClick={closePopup} />
        </div>
      </div>

      {!collapsed && (
        <div className="overflow-y-auto max-h-[60vh] border-t">
          {/* Tree issues */}
          {treeIssues.length > 0 && (
            <div>
              <p className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-gray-50 border-b">
                Bomen
              </p>
              {treeIssues.map((issue) => {
                const key      = `tree:${issue.city}:${issue.tree_id}`
                const name     = issue.species_binomial
                  ? capitalizeFirst(issue.species_binomial)
                  : '?'
                const dutch    = issue.name_indigenous
                  ? ` (${capitalizeFirst(issue.name_indigenous.toLowerCase())})`
                  : ''
                const canFly   = issue.lat !== null && issue.lon !== null
                const flagText = issue.flags.map((f) => treeFlagLabel[f] ?? f).join(', ')

                return (
                  <div key={key} className="flex items-start gap-2 border-b last:border-b-0">
                    <button
                      onClick={() => canFly ? flyToTree(issue.city, issue.lat, issue.lon) : undefined}
                      disabled={!canFly}
                      className={`flex-1 text-left py-2 pl-4 min-w-0 ${canFly ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}`}
                    >
                      <span className="block text-sm italic truncate">
                        {name}{dutch}
                      </span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {issue.street && `${issue.street} · `}{cityName(issue.city)}
                      </span>
                      {flagText && (
                        <span className="block text-xs text-amber-600 mt-0.5 truncate">{flagText}</span>
                      )}
                      {issue.note && (
                        <span className="block text-xs text-muted-foreground italic truncate">"{issue.note}"</span>
                      )}
                    </button>
                    <button
                      onClick={() => void handleResolveTree(issue.city, issue.tree_id)}
                      disabled={resolving === key}
                      className="shrink-0 p-2 mt-1 text-muted-foreground hover:text-green-600 disabled:opacity-40"
                      aria-label="Opgelost"
                      title="Markeer als opgelost"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Species issues */}
          {speciesIssues.length > 0 && (
            <div>
              <p className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-gray-50 border-b">
                Soorten
              </p>
              {speciesIssues.map((issue) => {
                const key      = `species:${issue.species_binomial}`
                const name     = capitalizeFirst(issue.species_binomial)
                const dutch    = issue.name_indigenous
                  ? ` (${capitalizeFirst(issue.name_indigenous.toLowerCase())})`
                  : ''
                const flagText = issue.flags.map((f) => speciesFlagLabel[f] ?? f).join(', ')

                return (
                  <div key={key} className="flex items-start gap-2 border-b last:border-b-0">
                    <div className="flex-1 py-2 pl-4 min-w-0">
                      <span className="block text-sm italic truncate">{name}{dutch}</span>
                      {flagText && (
                        <span className="block text-xs text-amber-600 mt-0.5 truncate">{flagText}</span>
                      )}
                      {issue.note && (
                        <span className="block text-xs text-muted-foreground italic truncate">"{issue.note}"</span>
                      )}
                    </div>
                    <button
                      onClick={() => void handleResolveSpecies(issue.species_binomial)}
                      disabled={resolving === key}
                      className="shrink-0 p-2 mt-1 text-muted-foreground hover:text-green-600 disabled:opacity-40"
                      aria-label="Opgelost"
                      title="Markeer als opgelost"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {total === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">Geen meldingen</p>
          )}
        </div>
      )}
    </PopupShell>
  )
}
