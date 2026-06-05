import { Crosshair } from 'lucide-react'
import { capitalizeFirst, capitalize } from '../lib/utils'
import { useStore } from '../store'

function wikiUrl(binomial: string): string {
  const parts = binomial.trim().split(/\s+/).filter((p) => p !== '×')
  const slug = parts
    .map((p, i) => (i === 0 ? capitalizeFirst(p) : p.toLowerCase()))
    .join('_')
  return `https://en.wikipedia.org/wiki/${slug}`
}

function Row({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: string | number | null | undefined
  valueClassName?: string
}) {
  if (value == null || value === '') return null
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground basis-1/3 shrink-0">{label}</span>
      <span className={`min-w-0 flex-1 font-medium ${valueClassName ?? ''}`}>{value}</span>
    </div>
  )
}

interface Props {
  onCenter: (lat: number, lon: number) => void
}

export function Popup({ onCenter }: Props) {
  const tree = useStore((s) => s.selectedTree)
  const setSelectedTree = useStore((s) => s.setSelectedTree)
  const setSelectedSpecies = useStore((s) => s.setSelectedSpecies)

  if (!tree) return null

  function close() {
    setSelectedTree(null)
    setSelectedSpecies(null)
  }

  const binomial = tree.species_binomial
  const displayName = capitalizeFirst(binomial ?? tree.species)
  const cultivar = tree.species_cultivar ? ` '${capitalizeFirst(tree.species_cultivar)}'` : ''

  return (
    <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[1000] w-72 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden">
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
        <div>
          <p className="font-semibold text-sm leading-snug italic">{displayName}{cultivar}</p>
          {tree.name_indigenous && (
            <p className="text-xs text-muted-foreground mt-0.5">{tree.name_indigenous.toLowerCase()}</p>
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
          <button
            onClick={close}
            className="text-muted-foreground hover:text-foreground leading-none text-2xl"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>

      <div className="px-4 pb-3 space-y-1 border-t pt-2">
        <Row label="Geplant" value={tree.year_planted} />
        <Row label="Straat" value={capitalize(tree.street)} />
        <Row
          label="Stamdiam."
          value={tree.trunk_diameter != null ? `${tree.trunk_diameter} m` : null}
        />
        <Row
          label="Kroon"
          value={tree.crown_spread != null ? `${tree.crown_spread} m` : null}
        />
      </div>

      {binomial && (
        <div className="px-4 pb-3">
          <a
            href={wikiUrl(binomial)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            Wikipedia ↗
          </a>
        </div>
      )}
    </div>
  )
}
