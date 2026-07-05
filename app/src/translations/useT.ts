import { useStore } from '../store'
import { TRANSLATIONS, type TranslationKey } from './strings'

export function useT() {
  const locale = useStore((s) => s.locale)
  return (key: TranslationKey, vars?: Record<string, string | number>) => {
    let str: string = TRANSLATIONS[locale][key] ?? TRANSLATIONS.nl[key]
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{${k}}`, String(v))
      }
    }
    return str
  }
}
