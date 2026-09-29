import type { Source } from '../types'
import type { Locale } from './locale'

export function getSourceDescription(source: Source, locale: Locale): string | undefined {
  return source.meta?.description?.[locale] ?? source.meta?.description?.nl
}
