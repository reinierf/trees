import { useState, useEffect, useCallback } from 'react'

export interface TreePhoto {
  squareUrl: string
  mediumUrl: string
  largeUrl: string
  attribution: string
  licenseCode: string | null
}

interface CachedTaxon {
  taxonId: number
  thumbnail: TreePhoto | null
}

// Module-level caches — survive re-renders and panel re-opens for the same species
const taxonCache = new Map<string, CachedTaxon | null>()   // null = not found
const fetchedBinomials = new Set<string>()                  // tracks completed step-1 fetches
const photosCache = new Map<number, TreePhoto[]>()

function normalizeBinomial(binomial: string): string {
  return binomial
    .trim()
    .split(/\s+/)
    .map((part, i) =>
      i === 0
        ? part[0].toUpperCase() + part.slice(1).toLowerCase()
        : part.toLowerCase()
    )
    .join(' ')
}

function photoFromRaw(p: {
  url?: string
  square_url?: string
  medium_url?: string
  large_url?: string
  attribution: string
  license_code: string | null
}): TreePhoto {
  return {
    squareUrl: p.square_url ?? p.url ?? '',
    mediumUrl: p.medium_url ?? p.url ?? '',
    largeUrl: p.large_url ?? p.medium_url ?? p.url ?? '',
    attribution: p.attribution,
    licenseCode: p.license_code,
  }
}

async function fetchTaxon(normalized: string): Promise<CachedTaxon | null> {
  const res = await fetch(
    `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(normalized)}&rank=species&per_page=1`
  )
  if (!res.ok) return null
  const data = await res.json() as { results: Array<{ id: number; default_photo?: Record<string, unknown> }> }
  const taxon = data.results?.[0]
  if (!taxon) return null
  return {
    taxonId: taxon.id,
    thumbnail: taxon.default_photo
      ? photoFromRaw(taxon.default_photo as Parameters<typeof photoFromRaw>[0])
      : null,
  }
}

async function fetchPhotos(taxonId: number): Promise<TreePhoto[]> {
  const res = await fetch(`https://api.inaturalist.org/v1/taxa/${taxonId}?all_photos=true`)
  if (!res.ok) return []
  const data = await res.json() as { results: Array<{ taxon_photos?: Array<{ photo: Record<string, unknown> }> }> }
  const taxonPhotos = data.results?.[0]?.taxon_photos ?? []
  return taxonPhotos
    .filter((tp) => tp.photo.license_code !== null)
    .map((tp) => photoFromRaw(tp.photo as Parameters<typeof photoFromRaw>[0]))
}

export function useTreePhotos(binomial: string | null) {
  const normalized = binomial ? normalizeBinomial(binomial) : null

  function getInitialTaxon(): CachedTaxon | null | undefined {
    if (!normalized) return null
    if (!fetchedBinomials.has(normalized)) return undefined  // undefined = still loading
    return taxonCache.get(normalized) ?? null
  }

  function getInitialPhotos(): TreePhoto[] | null {
    const taxon = getInitialTaxon()
    if (!taxon?.taxonId) return null
    return photosCache.get(taxon.taxonId) ?? null
  }

  const [taxon, setTaxon] = useState<CachedTaxon | null | undefined>(getInitialTaxon)
  const [photos, setPhotos] = useState<TreePhoto[] | null>(getInitialPhotos)

  useEffect(() => {
    if (!normalized) { setTaxon(null); setPhotos(null); return }

    if (fetchedBinomials.has(normalized)) {
      const cached = taxonCache.get(normalized) ?? null
      setTaxon(cached)
      if (cached?.taxonId != null) {
        setPhotos(photosCache.get(cached.taxonId) ?? null)
      }
      return
    }

    let cancelled = false
    fetchTaxon(normalized).then((result) => {
      if (cancelled) return
      fetchedBinomials.add(normalized)
      taxonCache.set(normalized, result)
      setTaxon(result)
    }).catch(() => {
      if (!cancelled) {
        fetchedBinomials.add(normalized)
        taxonCache.set(normalized, null)
        setTaxon(null)
      }
    })
    return () => { cancelled = true }
  }, [normalized])

  const loadPhotos = useCallback(async () => {
    if (!taxon?.taxonId || photos !== null) return
    const { taxonId } = taxon
    if (photosCache.has(taxonId)) {
      setPhotos(photosCache.get(taxonId)!)
      return
    }
    try {
      const ps = await fetchPhotos(taxonId)
      photosCache.set(taxonId, ps)
      setPhotos(ps)
    } catch (e) {
      console.error('iNaturalist photo fetch failed', e)
    }
  }, [taxon, photos])

  return {
    // undefined = still fetching, null = not found/no binomial, TreePhoto = ready
    thumbnail: taxon === undefined ? undefined : (taxon?.thumbnail ?? null),
    photos,
    loadPhotos,
  }
}
