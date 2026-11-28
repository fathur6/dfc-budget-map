import { translations } from './translations.js'

export const languages = [
  ['en', 'English', 'en-MY'],
  ['ms', 'Bahasa Melayu', 'ms-MY'],
  ['id', 'Bahasa Indonesia', 'id-ID'],
  ['th', 'ไทย', 'th-TH-u-ca-gregory'],
]
const storageKey = 'dfc-budget-map:preferences'
const defaults = { language: 'en', theme: 'dark' }
let language = defaults.language

export function readPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    return {
      language: languages.some(([code]) => code === saved?.language) ? saved.language : defaults.language,
      theme: saved?.theme === 'light' ? 'light' : defaults.theme,
    }
  } catch {
    return defaults
  }
}

export function applyPreferences(preferences) {
  language = preferences.language
  document.documentElement.lang = language
  document.documentElement.dataset.theme = preferences.theme
}

export function savePreferences(preferences) {
  applyPreferences(preferences)
  try { localStorage.setItem(storageKey, JSON.stringify(preferences)) } catch { /* Session preferences still apply. */ }
}

export function appLocale() {
  return languages.find(([code]) => code === language)[2]
}

export function t(message, values) {
  const catalog = translations[language]
  const translated = catalog && Object.hasOwn(catalog, message) ? catalog[message] : message
  return values ? translated.replace(/\{(\w+)\}/g, (token, key) => values[key] ?? token) : translated
}
