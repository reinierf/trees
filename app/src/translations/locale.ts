export const LOCALES = ['nl', 'en', 'de', 'fr'] as const
export type Locale = (typeof LOCALES)[number]

export const LOCALE_LABELS: Record<Locale, string> = {
  nl: 'Nederlands',
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
}

const INTL_TAGS: Record<Locale, string> = {
  nl: 'nl-NL',
  en: 'en-GB',
  de: 'de-DE',
  fr: 'fr-FR',
}

export function intlTag(locale: Locale): string {
  return INTL_TAGS[locale]
}
