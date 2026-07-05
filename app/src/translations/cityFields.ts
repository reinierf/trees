import type { City } from '../types'
import type { Locale } from './locale'

export function getCityDescription(city: City, locale: Locale): string | undefined {
  return city.meta?.description?.[locale] ?? city.meta?.description?.nl
}
