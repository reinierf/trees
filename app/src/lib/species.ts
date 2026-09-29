import { useCallback } from 'react'
import { useStore } from '../store'
import { capitalizeFirst } from './utils'
import type { Locale } from '../translations/locale'
import type { SpeciesEntry } from '../types'

export interface SpeciesNames {
  /** species_binomial, or the raw species string when there is no binomial */
  key: string
  binomial: string | null
  /** vernacular name in the given locale, falling back to Dutch; null if none known */
  vernacular: string | null
}

const UNKNOWN: SpeciesNames = { key: '?', binomial: null, vernacular: null }

export function speciesNames(
  speciesById: Map<number, SpeciesEntry>,
  locale: Locale,
  id: number,
): SpeciesNames {
  const entry = speciesById.get(id)
  if (!entry) return UNKNOWN
  return { key: entry.key, binomial: entry.binomial, vernacular: entry.names[locale] ?? entry.names.nl ?? null }
}

/** Name lookup that re-renders the caller when the locale or the species dictionary changes. */
export function useSpeciesNames(): (id: number) => SpeciesNames {
  const speciesById = useStore((s) => s.speciesById)
  const locale = useStore((s) => s.locale)
  return useCallback((id: number) => speciesNames(speciesById, locale, id), [speciesById, locale])
}

/** Non-reactive lookup for code outside React render (map controller, event handlers). */
export function lookupSpeciesNames(id: number): SpeciesNames {
  const { speciesById, locale } = useStore.getState()
  return speciesNames(speciesById, locale, id)
}

/** Source datasets write vernacular names in capitals ("ESDOORNBLADIGE PLATAAN"): normalise for display,
 *  keeping cultivar quotes capitalised ("'Globosum'"). */
export function formatVernacular(name: string): string {
  return capitalizeFirst(name.toLowerCase()).replace(/'([a-z])/g, (_, c: string) => `'${c.toUpperCase()}`)
}

/** Display name for the current name mode. */
export function displayName(names: SpeciesNames, nameMode: 'scientific' | 'vernacular'): string {
  return nameMode === 'vernacular' && names.vernacular
    ? formatVernacular(names.vernacular)
    : capitalizeFirst(names.key)
}
