import { useMemo, useRef, useEffect } from 'react'
import { Crosshair, ChevronLeft } from 'lucide-react'
import { capitalizeFirst, capitalize } from '../lib/utils'
import { useStore } from '../store'

let savedSpeciesListScroll = 0
let savedSpeciesListKey = ''

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
}: {
  label: string
  value: string | number | null | undefined
}) {
  if (value == null || value === '') return null
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground basis-1/3 shrink-0">{label}</span>
      <span className="min-w-0 flex-1 font-medium">{value}</span>
    </div>
  )
}

const BASE =
  'absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[1000] w-72 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden'

interface Props {
  onCenter: (lat: number, lon: number) => void
}

export function InfoPopup({ onCenter }: Props) {
  const popupView = useStore((s) => s.popupView)
  const visibleTrees = useStore((s) => s.visibleTrees)
  const openSpeciesList = useStore((s) => s.openSpeciesList)
  const openSpeciesDetail = useStore((s) => s.openSpeciesDetail)
  const openTreeDetail = useStore((s) => s.openTreeDetail)
  const closePopup = useStore((s) => s.closePopup)

  const scrollRef = useRef<HTMLDivElement>(null)

  const speciesList = useMemo(() => {
    const counts = new Map<string, number>()
    for (const tree of visibleTrees) {
      const key = tree.species_binomial ?? tree.species
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.count - b.count || a.name.localeCompare(b.name))
  }, [visibleTrees])

  const speciesListKey = speciesList.map((s) => s.name).join('|')

  useEffect(() => {
    if (!scrollRef.current) return
    if (popupView?.kind === 'species-list') {
      scrollRef.current.scrollTop =
        speciesListKey === savedSpeciesListKey ? savedSpeciesListScroll : 0
    } else {
      scrollRef.current.scrollTop = 0
    }
  }, [popupView?.kind, speciesListKey])

  if (!popupView) return null

  function handleClose() {
    if (popupView?.kind === 'species-list' && scrollRef.current) {
      savedSpeciesListScroll = scrollRef.current.scrollTop
      savedSpeciesListKey = speciesListKey
    }
    closePopup()
  }

  // ── Species list ──────────────────────────────────────────────────────────
  if (popupView.kind === 'species-list') {
    return (
      <div className={BASE}>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <p className="font-semibold text-sm">
            Species in view{' '}
            <span className="text-muted-foreground font-normal">({speciesList.length})</span>
          </p>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground leading-none text-2xl"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div ref={scrollRef} className="overflow-y-auto max-h-[60vh] border-t">
          {speciesList.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No trees in view</p>
          ) : (
            speciesList.map(({ name, count }) => (
              <button
                key={name}
                onClick={() => openSpeciesDetail(name)}
                className="flex items-center justify-between w-full px-4 py-2 text-sm hover:bg-gray-50 text-left"
              >
                <span className="italic min-w-0 truncate">{capitalizeFirst(name)}</span>
                <span className="text-muted-foreground text-xs ml-3 shrink-0">{count}</span>
              </button>
            ))
          )}
        </div>
      </div>
    )
  }

  // ── Species detail ────────────────────────────────────────────────────────
  if (popupView.kind === 'species-detail') {
    const { species } = popupView
    const trees = visibleTrees
      .filter((t) => (t.species_binomial ?? t.species) === species)
      .sort(
        (a, b) =>
          capitalize(a.street).localeCompare(capitalize(b.street)) ||
          (Number(b.year_planted) || 0) - (Number(a.year_planted) || 0),
      )

    return (
      <div className={BASE}>
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
          <div className="flex items-center gap-1 min-w-0">
            <button
              onClick={openSpeciesList}
              className="text-muted-foreground hover:text-foreground shrink-0 -ml-1"
              aria-label="Back to species list"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="font-semibold text-sm italic truncate">{capitalizeFirst(species)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-muted-foreground text-xs">{trees.length}</span>
            <button
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground leading-none text-2xl"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
        <div ref={scrollRef} className="overflow-y-auto max-h-[60vh] border-t">
          {trees.map((tree) => (
            <button
              key={tree.id}
              onClick={() => {
                openTreeDetail(tree, species)
                onCenter(tree.lat, tree.lon)
              }}
              className="flex items-center justify-between w-full px-4 py-2 text-sm hover:bg-gray-50 text-left"
            >
              <span className="min-w-0 truncate">{capitalize(tree.street)}</span>
              {tree.year_planted && (
                <span className="text-muted-foreground text-xs ml-3 shrink-0">
                  {tree.year_planted}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Tree detail ───────────────────────────────────────────────────────────
  const { tree, fromSpecies } = popupView
  const binomial = tree.species_binomial
  const speciesKey = binomial ?? tree.species
  const displayName = capitalizeFirst(binomial ?? tree.species)
  const cultivar = tree.species_cultivar ? ` '${capitalizeFirst(tree.species_cultivar)}'` : ''

  return (
    <div className={BASE}>
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
        <div className="min-w-0">
          {fromSpecies && (
            <button
              onClick={() => openSpeciesDetail(fromSpecies)}
              className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground text-xs mb-1 -ml-0.5"
              aria-label="Back to species"
            >
              <ChevronLeft size={12} />
              <span className="italic truncate">{capitalizeFirst(fromSpecies)}</span>
            </button>
          )}
          <button
            onClick={() => openSpeciesDetail(speciesKey)}
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
          <button
            onClick={handleClose}
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
