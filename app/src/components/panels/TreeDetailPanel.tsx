import { useState, useRef } from 'react'
import { Crosshair, Heart, Share2, ArrowUp, Image, ImageOff, Flag } from 'lucide-react'
import { capitalizeFirst, capitalize } from '../../lib/utils'
import { useStore } from '../../store'
import { WikipediaIcon, GoogleIcon } from '../icons'
import { PopupShell, CloseButton, CollapseButton } from '../InfoPopup'
import { useTreePhotos } from '../../api/useTreePhotos'
import { TreeImageModal } from '../TreeImageModal'
import { FlagModal } from '../FlagModal'
import { flagTree, flagSpecies } from '../../api/trees'
import type { Tree, TreeIssue, SpeciesIssue } from '../../types'

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
  const debugMode        = useStore((s) => s.debugMode)
  const upsertTreeIssue  = useStore((s) => s.upsertTreeIssue)
  const upsertSpeciesIssue = useStore((s) => s.upsertSpeciesIssue)
  const hasTreeIssue     = useStore((s) => s.treeIssues.some((i) => i.city === cityId && i.tree_id === tree.id))
  const hasSpeciesIssue  = useStore((s) => s.speciesIssues.some((i) => i.species_binomial === tree.species_binomial))
  const [collapsed, setCollapsed] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [photoModalOpen, setPhotoModalOpen] = useState(false)
  const [treeFlagOpen, setTreeFlagOpen]       = useState(false)
  const [speciesFlagOpen, setSpeciesFlagOpen] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { thumbnail, photos, loadPhotos } = useTreePhotos(tree.species_binomial)

  function openPhotos() {
    setPhotoModalOpen(true)
    void loadPhotos()
  }

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
    <>
    <PopupShell>
      <div className="px-4 pt-2 pb-2">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={handleUpButton}
            className="font-semibold text-sm leading-snug italic text-left hover:underline min-w-0"
          >
            <ArrowUp size={12} className="inline-block mr-0.5 -mt-0.5 opacity-50" />
            {displayName}{cultivar}
          </button>
          <div className="flex items-center gap-2 shrink-0">
            {debugMode && binomial && (
              <button
                onClick={() => setSpeciesFlagOpen(true)}
                className={hasSpeciesIssue ? 'text-amber-500' : 'text-muted-foreground hover:text-foreground'}
                aria-label="Markeer datafout voor soort"
                title={hasSpeciesIssue ? 'Soort al gemeld — klik om te bewerken' : 'Markeer datafout voor soort'}
              >
                <Flag size={13} className={hasSpeciesIssue ? 'fill-amber-500' : ''} />
              </button>
            )}
            <CollapseButton collapsed={collapsed} onClick={() => setCollapsed((c) => !c)} />
            <CloseButton onClick={closePopup} />
          </div>
        </div>

        {!collapsed && tree.name_indigenous && (
          <p className="text-sm mt-0.5">
            {capitalizeFirst(tree.name_indigenous.toLowerCase()).replace(/'([a-z])/g, (_, c) => `'${c.toUpperCase()}`)}
          </p>
        )}
      </div>

      {!collapsed && (
        <>
          <div className="flex gap-2 px-4 pb-3 border-t pt-2">
            <div className="flex-1 space-y-1 min-w-0">
              <Row label="Geplant" value={tree.year_planted} />
              <Row label="Straat" value={capitalize(tree.street)} />
              <Row label="Stamdiam." value={tree.trunk_diameter != null ? `${tree.trunk_diameter} m` : null} />
              <Row label="Kroon" value={tree.crown_spread != null ? `${tree.crown_spread} m` : null} />
            </div>
            {binomial && (
              <div className="w-11 h-11 shrink-0 self-start flex items-center justify-center">
                {thumbnail === undefined && (
                  <Image size={22} className="text-muted-foreground opacity-40" />
                )}
                {thumbnail === null && (
                  <ImageOff size={22} className="text-muted-foreground opacity-40" />
                )}
                {thumbnail && (
                  <button
                    onClick={openPhotos}
                    className="w-full h-full rounded-sm overflow-hidden block"
                    aria-label="Bekijk foto's"
                  >
                    <img src={thumbnail.mediumUrl} alt="" className="w-full h-full object-cover" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="px-4 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {binomial && (
                <>
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
                </>
              )}
              {debugMode && (
                <button
                  onClick={() => setTreeFlagOpen(true)}
                  className={hasTreeIssue ? 'text-amber-500' : 'text-muted-foreground hover:text-foreground'}
                  aria-label="Markeer datafout voor boom"
                  title={hasTreeIssue ? 'Boom al gemeld — klik om te bewerken' : 'Markeer datafout voor boom'}
                >
                  <Flag size={15} className={hasTreeIssue ? 'fill-amber-500' : ''} />
                </button>
              )}
            </div>
            <div className="relative flex items-center gap-3">
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
              {toast && (
                <div className="absolute top-full right-0 mt-1 bg-popover text-popover-foreground border text-xs rounded px-2 py-1 shadow-md max-w-[220px] truncate z-10">
                  {toast}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </PopupShell>
    {photoModalOpen && thumbnail && (
      <TreeImageModal
        thumbnail={thumbnail}
        photos={photos}
        speciesName={`${displayName}${cultivar}`}
        indigenousName={tree.name_indigenous
          ? capitalizeFirst(tree.name_indigenous.toLowerCase()).replace(/'([a-z])/g, (_, c) => `'${c.toUpperCase()}`)
          : null}
        onClose={() => setPhotoModalOpen(false)}
      />
    )}
    {treeFlagOpen && (
      <FlagModal
        mode="tree"
        tree={tree}
        cityId={cityId}
        noImages={thumbnail === null}
        onClose={() => setTreeFlagOpen(false)}
        onSubmit={async (flags, note) => {
          await flagTree(cityId, tree.id, tree.lat, tree.lon, tree.species_binomial, tree.name_indigenous, tree.street, flags, note)
          const now = new Date().toISOString()
          upsertTreeIssue({ city: cityId, tree_id: tree.id, lat: tree.lat, lon: tree.lon, species_binomial: tree.species_binomial, name_indigenous: tree.name_indigenous, street: tree.street, flags, note: note || null, created_at: now, updated_at: now } as TreeIssue)
        }}
      />
    )}
    {speciesFlagOpen && binomial && (
      <FlagModal
        mode="species"
        tree={tree}
        cityId={cityId}
        noImages={thumbnail === null}
        onClose={() => setSpeciesFlagOpen(false)}
        onSubmit={async (flags, note) => {
          await flagSpecies(binomial, tree.name_indigenous, flags, note)
          const now = new Date().toISOString()
          upsertSpeciesIssue({ species_binomial: binomial, name_indigenous: tree.name_indigenous, flags, note: note || null, created_at: now, updated_at: now } as SpeciesIssue)
        }}
      />
    )}
    </>
  )
}
