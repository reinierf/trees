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

function googleUrl(binomial: string, cultivar?: string | null): string {
  const parts = binomial.trim().split(/\s+/)
  const formatted = parts.map((p, i) => (i === 0 ? capitalizeFirst(p) : p.toLowerCase())).join(' ')
  const query = cultivar ? `${formatted} '${capitalizeFirst(cultivar)}'` : formatted
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
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
        <div className="px-4 pb-3 flex items-center gap-3">
          <a
            href={wikiUrl(binomial)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Wikipedia"
            className="opacity-70 hover:opacity-100"
          >
            <svg viewBox="0 0 97.75 97.75" width="18" height="18" aria-hidden="true">
              <path d="M48.875,0C21.883,0,0,21.883,0,48.875S21.883,97.75,48.875,97.75S97.75,75.867,97.75,48.875S75.867,0,48.875,0z M77.691,37.503c-2.779,6.28-11.279,26.171-16.951,39.136c-0.008,0.006-1.486-0.003-1.49-0.005l-8.945-21.069 c-3.545,6.953-7.473,14.181-10.832,21.059c-0.02,0.035-1.625,0.016-1.627-0.006c-5.135-11.986-10.459-23.893-15.621-35.87 c-1.195-2.928-5.387-7.637-8.256-7.61c0-0.34-0.016-1.099-0.02-1.558l17.682-0.002l-0.014,1.531 c-2.076,0.096-5.664,1.421-4.734,3.713c2.492,5.381,11.316,26.227,13.701,31.519c1.664-3.257,6.311-11.939,8.225-15.609 c-1.5-3.078-6.457-14.57-7.943-17.464c-1.121-1.887-3.934-2.118-6.1-2.151c0-0.483,0.025-0.855,0.016-1.518l15.543,0.048v1.412 c-2.104,0.058-4.096,0.841-3.193,2.853c2.091,4.34,3.312,7.43,5.231,11.444c0.613-1.176,3.755-7.622,5.253-11.024 c0.905-2.262-0.447-3.109-4.232-3.211c0.05-0.372,0.017-1.119,0.05-1.475l13.424,0.013l0.006,1.401 c-2.467,0.096-5.021,1.41-6.354,3.45l-6.464,13.406c0.709,1.773,6.924,15.58,7.578,17.111L74.988,36.18 c-0.951-2.497-3.984-3.055-5.17-3.082c0.008-0.398,0.01-1.005,0.012-1.512l13.951,0.04l0.02,0.07l-0.023,1.394 C80.717,33.183,78.824,34.82,77.691,37.503z"/>
            </svg>
          </a>
          <a
            href={googleUrl(binomial, tree.species_cultivar)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Google search"
            className="opacity-70 hover:opacity-100"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          </a>
        </div>
      )}
    </div>
  )
}
