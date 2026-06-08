import { Crosshair } from 'lucide-react'
import { capitalizeFirst, capitalize } from '../../lib/utils'
import { useStore } from '../../store'
import { WikipediaIcon, GoogleIcon } from '../icons'
import { PopupShell, CloseButton } from '../InfoPopup'
import type { Tree } from '../../types'

function wikiUrl(binomial: string): string {
  const parts = binomial.trim().split(/\s+/).filter((p) => p !== '×')
  const slug = parts
    .map((p, i) => (i === 0 ? capitalizeFirst(p) : p.toLowerCase()))
    .join('_')
  return `https://en.wikipedia.org/wiki/${slug}`
}

function googleUrl(binomial: string, cultivar?: string | null): string {
  const parts = binomial.trim().split(/\s+/)
  const formatted = parts.map((p, i) => (i === 0 ? capitalizeFirst(p) : p.toLowerCase())).join(' ')
  const query = cultivar ? `${formatted} '${capitalizeFirst(cultivar)}'` : formatted
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground basis-1/3 shrink-0">{label}</span>
      <span className="min-w-0 flex-1 font-medium">{value}</span>
    </div>
  )
}

interface Props {
  tree: Tree
  onCenter: (lat: number, lon: number) => void
}

export function TreeDetailPanel({ tree, onCenter }: Props) {
  const openSpeciesListAt = useStore((s) => s.openSpeciesListAt)
  const closePopup = useStore((s) => s.closePopup)

  const binomial = tree.species_binomial
  const speciesKey = binomial ?? tree.species
  const displayName = capitalizeFirst(binomial ?? tree.species)
  const cultivar = tree.species_cultivar ? ` '${capitalizeFirst(tree.species_cultivar)}'` : ''

  return (
    <PopupShell>
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
        <div className="min-w-0">
<button
            onClick={() => openSpeciesListAt(speciesKey, tree.id)}
            className="font-semibold text-sm leading-snug italic text-left hover:underline"
          >
            {displayName}{cultivar}
          </button>
          {tree.name_indigenous && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {tree.name_indigenous.toLowerCase()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 mt-0.5">
          <button
            onClick={() => onCenter(tree.lat, tree.lon)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Center map on tree"
          >
            <Crosshair size={15} />
          </button>
          <CloseButton onClick={closePopup} />
        </div>
      </div>

      <div className="px-4 pb-3 space-y-1 border-t pt-2">
        <Row label="Geplant" value={tree.year_planted} />
        <Row label="Straat" value={capitalize(tree.street)} />
        <Row label="Stamdiam." value={tree.trunk_diameter != null ? `${tree.trunk_diameter} m` : null} />
        <Row label="Kroon" value={tree.crown_spread != null ? `${tree.crown_spread} m` : null} />
      </div>

      {binomial && (
        <div className="px-4 pb-3 flex items-center gap-3">
          <a
            href={wikiUrl(binomial)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Wikipedia"
            className="opacity-70 hover:opacity-100"
          >
            <WikipediaIcon />
          </a>
          <a
            href={googleUrl(binomial, tree.species_cultivar)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Google search"
            className="opacity-70 hover:opacity-100"
          >
            <GoogleIcon />
          </a>
        </div>
      )}
    </PopupShell>
  )
}
