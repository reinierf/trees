import { useStore } from '../store'

function wikiUrl(binomial: string): string {
  const parts = binomial.trim().split(/\s+/).filter((p) => p !== '×')
  const slug = parts
    .map((p, i) => (i === 0 ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p.toLowerCase()))
    .join('_')
  return `https://en.wikipedia.org/wiki/${slug}`
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground w-32 shrink-0">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

export function Popup() {
  const tree = useStore((s) => s.selectedTree)
  const setSelectedTree = useStore((s) => s.setSelectedTree)
  const setSelectedSpecies = useStore((s) => s.setSelectedSpecies)

  if (!tree) return null

  function close() {
    setSelectedTree(null)
    setSelectedSpecies(null)
  }

  const binomial = tree.species_binomial
  const displayName = binomial
    ? binomial
        .split(/\s+/)
        .map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
        .join(' ')
    : tree.species

  return (
    <div className="absolute bottom-4 right-4 z-[1000] w-72 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden">
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
        <div>
          <p className="font-semibold text-sm leading-snug italic">{displayName}</p>
          {tree.name_indigenous && (
            <p className="text-xs text-muted-foreground mt-0.5">{tree.name_indigenous}</p>
          )}
        </div>
        <button
          onClick={close}
          className="text-muted-foreground hover:text-foreground leading-none text-lg mt-0.5 shrink-0"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="px-4 pb-3 space-y-1 border-t pt-2">
        <Row label="Geplant" value={tree.year_planted} />
        <Row label="Straat" value={tree.street} />
        <Row
          label="Stamdiameter"
          value={tree.trunk_diameter != null ? `${tree.trunk_diameter} m` : null}
        />
        <Row
          label="Kroonbreedte"
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
