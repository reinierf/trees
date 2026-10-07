import { loadPreference, savePreference } from './preferencesStorage'

const WELCOME_HIDDEN_KEY = 'welcome-hidden'

export function isWelcomeHidden(): boolean {
  return loadPreference<boolean>(WELCOME_HIDDEN_KEY, false)
}

export function setWelcomeHidden(hidden: boolean): void {
  savePreference(WELCOME_HIDDEN_KEY, hidden)
}
