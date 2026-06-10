import { useState, useRef } from 'react'
import { Crosshair, Heart, Share2, ArrowUp } from 'lucide-react'
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

function buildShareUrl(tree: Tree): string {
  const hash = window.location.hash
  const qIdx = hash.indexOf('?')
  const pathPart = qIdx !== -1 ? hash.slice(0, qIdx) : hash
  const params = new URLSearchParams()
  params.set('tree', tree.id)
  params.set('lat', String(tree.lat))
  params.set('lon', String(tree.lon))
  return `${window.location.origin}${window.location.pathname}${pathPart}?${params}`
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
  returnTo: 'species-list' | 'favourites'
  cityId: string
}

export function TreeDetailPanel({ tree, returnTo, cityId }: Props) {
  const openSpeciesListAt = useStore((s) => s.openSpeciesListAt)
  const openFavourites = useStore((s) => s.openFavourites)
  const closePopup = useStore((s) => s.closePopup)
  const setPendingCenter = useStore((s) => s.setPendingCenter)
  const toggleFavourite = useStore((s) => s.toggleFavourite)
  const favourites = useStore((s) => s.favourites)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isFav = (favourites[cityId] ?? []).some((t) => t.id === tree.id)

  const binomial = tree.species_binomial
  const speciesKey = binomial ?? tree.species
  const displayName = capitalizeFirst(binomial ?? tree.species)
  const cultivar = tree.species_cultivar ? ` '${capitalizeFirst(tree.species_cultivar)}'` : ''

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }

  async function handleShare() {
    const url = buildShareUrl(tree)
    const title = `${displayName}${cultivar}`

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url })
        return
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      showToast('Link gekopieerd')
    } catch {
      showToast(url)
    }
  }

  function handleUpButton() {
    if (returnTo === 'favourites') {
      openFavourites()
    } else {
      openSpeciesListAt(speciesKey, tree.id)
    }
  }

  return (
    <PopupShell>
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
        <div className="min-w-0">
          <button
            onClick={handleUpButton}
            className="font-semibold text-sm leading-snug italic text-left hover:underline"
          >
            <ArrowUp size={12} className="inline-block mr-0.5 -mt-0.5 opacity-50" />
            {displayName}{cultivar}
          </button>
          {tree.name_indigenous && (
            <p className="text-sm mt-0.5">
              {capitalizeFirst(tree.name_indigenous.toLowerCase()).replace(/'([a-z])/g, (_, c) => `'${c.toUpperCase()}`)}
            </p>
          )}
        </div>
        <div className="relative flex items-center gap-3 shrink-0 mt-0.5">
          <button
            onClick={() => toggleFavourite(cityId, tree)}
            className={`${isFav ? 'text-red-400' : 'text-muted-foreground hover:text-foreground'}`}
            aria-label={isFav ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten'}
          >
            <Heart size={15} className={isFav ? 'fill-red-400' : ''} />
          </button>
          <button
            onClick={handleShare}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Deel link naar boom"
          >
            <Share2 size={15} />
          </button>
          <button
            onClick={() => setPendingCenter([tree.lat, tree.lon])}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Center map on tree"
          >
            <Crosshair size={15} />
          </button>
          <CloseButton onClick={closePopup} />
          {toast && (
            <div className="absolute top-full right-0 mt-1 bg-popover text-popover-foreground border text-xs rounded px-2 py-1 shadow-md max-w-[220px] truncate z-10">
              {toast}
            </div>
          )}
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
