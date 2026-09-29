import { useState, useRef } from 'react'
import { Crosshair, Heart, Share2, ArrowUp, Image, ImageOff, Flag } from 'lucide-react'
import { capitalizeFirst, capitalize } from '../../lib/utils'
import { formatVernacular, useSpeciesNames } from '../../lib/species'
import { treeKey } from '../../lib/treeKey'
import { useStore, PopupKind, type PopupReturnTo } from '../../store'
import { WikipediaIcon, GoogleIcon } from '../icons'
import { PopupShell, CloseButton, CollapseButton } from '../InfoPopup'
import { useTreePhotos } from '../../api/useTreePhotos'
import { useTreeDetails } from '../../api/useTreeDetails'
import { TreeImageModal } from '../TreeImageModal'
import { FlagModal, type FlagSubject } from '../FlagModal'
import { flagTree, flagSpecies } from '../../api/trees'
import { shareUrl } from '../../map/urlState'
import { SHARE_ZOOM } from '../../config'
import { useT } from '../../translations/useT'
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
  returnTo: PopupReturnTo
}

export function TreeDetailPanel({ tree, returnTo }: Props) {
  const t = useT()
  const openSpeciesListAt = useStore((s) => s.openSpeciesListAt)
  const openFavourites = useStore((s) => s.openFavourites)
  const openSamePointList = useStore((s) => s.openSamePointList)
  const visibleTrees = useStore((s) => s.visibleTrees)
  const closePopup = useStore((s) => s.closePopup)
  const setPendingCenter = useStore((s) => s.setPendingCenter)
  const toggleFavourite = useStore((s) => s.toggleFavourite)
  const isFav = useStore((s) => s.favourites[treeKey(tree)] !== undefined)
  const debugMode        = useStore((s) => s.debugMode)
  const upsertTreeIssue  = useStore((s) => s.upsertTreeIssue)
  const upsertSpeciesIssue = useStore((s) => s.upsertSpeciesIssue)
  const names = useSpeciesNames()(tree.speciesId)
  const hasTreeIssue     = useStore((s) => s.treeIssues.some((i) => i.city === tree.source && i.tree_id === tree.id))
  const hasSpeciesIssue  = useStore((s) => s.speciesIssues.some((i) => i.species_binomial === names.binomial))
  const details = useTreeDetails(tree)
  const [collapsed, setCollapsed] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [photoModalOpen, setPhotoModalOpen] = useState(false)
  const [treeFlagOpen, setTreeFlagOpen]       = useState(false)
  const [speciesFlagOpen, setSpeciesFlagOpen] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const binomial = names.binomial
  const { thumbnail, photos, loadPhotos } = useTreePhotos(binomial)

  function openPhotos() {
    setPhotoModalOpen(true)
    void loadPhotos()
  }

  const displayName = capitalizeFirst(names.key)
  const cultivarName = details?.species_cultivar ?? null
  const cultivar = cultivarName ? ` '${capitalizeFirst(cultivarName)}'` : ''
  const vernacular = names.vernacular ? formatVernacular(names.vernacular) : null

  const flagSubject: FlagSubject = {
    source: tree.source,
    id: tree.id,
    binomial,
    cultivar: cultivarName,
    vernacular: names.vernacular,
    street: details?.street ?? null,
  }

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }

  async function handleShare() {
    const url = shareUrl(tree, SHARE_ZOOM)
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
      showToast(t('tree.linkCopied'))
    } catch {
      showToast(url)
    }
  }

  function handleUpButton() {
    if (returnTo === PopupKind.Favourites) {
      openFavourites()
    } else if (returnTo === PopupKind.SamePointList) {
      openSamePointList(visibleTrees.filter((t) => t.lat === tree.lat && t.lon === tree.lon))
    } else {
      openSpeciesListAt(tree.speciesId, treeKey(tree))
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
                aria-label={t('tree.flagSpecies')}
                title={hasSpeciesIssue ? t('tree.speciesFlagged') : t('tree.flagSpecies')}
              >
                <Flag size={13} className={hasSpeciesIssue ? 'fill-amber-500' : ''} />
              </button>
            )}
            <CollapseButton collapsed={collapsed} onClick={() => setCollapsed((c) => !c)} />
            <CloseButton onClick={closePopup} />
          </div>
        </div>

        {!collapsed && vernacular && (
          <p className="text-sm mt-0.5">{vernacular}</p>
        )}
      </div>

      {!collapsed && (
        <>
          <div className="flex gap-2 px-4 pb-3 border-t pt-2">
            <div className="flex-1 space-y-1 min-w-0">
              {details === undefined ? (
                <p className="text-sm text-muted-foreground">…</p>
              ) : (
                <>
                  <Row label={t('tree.planted')} value={details?.year_planted} />
                  <Row label={t('tree.street')} value={details?.street != null ? capitalize(details.street) : null} />
                  <Row label={t('tree.trunkDiameter')} value={details?.trunk_diameter != null ? `${details.trunk_diameter} m` : null} />
                  <Row label={t('tree.crown')} value={details?.crown_spread != null ? `${details.crown_spread} m` : null} />
                </>
              )}
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
                    aria-label={t('tree.viewPhotos')}
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
                    href={googleUrl(binomial, cultivarName)}
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
                  aria-label={t('tree.flagTree')}
                  title={hasTreeIssue ? t('tree.treeFlagged') : t('tree.flagTree')}
                >
                  <Flag size={15} className={hasTreeIssue ? 'fill-amber-500' : ''} />
                </button>
              )}
            </div>
            <div className="relative flex items-center gap-3">
              <button
                onClick={() => toggleFavourite(tree, details ?? null)}
                className={`${isFav ? 'text-red-400' : 'text-muted-foreground hover:text-foreground'}`}
                aria-label={isFav ? t('tree.removeFavourite') : t('tree.addFavourite')}
              >
                <Heart size={15} className={isFav ? 'fill-red-400' : ''} />
              </button>
              <button
                onClick={handleShare}
                className="text-muted-foreground hover:text-foreground"
                aria-label={t('tree.shareLink')}
              >
                <Share2 size={15} />
              </button>
              <button
                onClick={() => setPendingCenter([tree.lat, tree.lon])}
                className="text-muted-foreground hover:text-foreground"
                aria-label={t('tree.centerOnTree')}
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
        vernacularName={vernacular}
        onClose={() => setPhotoModalOpen(false)}
      />
    )}
    {treeFlagOpen && (
      <FlagModal
        mode="tree"
        subject={flagSubject}
        noImages={thumbnail === null}
        onClose={() => setTreeFlagOpen(false)}
        onSubmit={async (flags, note) => {
          await flagTree(tree.source, tree.id, tree.lat, tree.lon, binomial, names.vernacular, flagSubject.street, flags, note)
          const now = new Date().toISOString()
          upsertTreeIssue({ city: tree.source, tree_id: tree.id, lat: tree.lat, lon: tree.lon, species_binomial: binomial, name_vernacular: names.vernacular, street: flagSubject.street, flags, note: note || null, created_at: now, updated_at: now } as TreeIssue)
        }}
      />
    )}
    {speciesFlagOpen && binomial && (
      <FlagModal
        mode="species"
        subject={flagSubject}
        noImages={thumbnail === null}
        onClose={() => setSpeciesFlagOpen(false)}
        onSubmit={async (flags, note) => {
          await flagSpecies(binomial, names.vernacular, flags, note)
          const now = new Date().toISOString()
          upsertSpeciesIssue({ species_binomial: binomial, name_vernacular: names.vernacular, flags, note: note || null, created_at: now, updated_at: now } as SpeciesIssue)
        }}
      />
    )}
    </>
  )
}
