import i18n from "i18next"
import { initReactI18next } from "react-i18next"

// Import translations directly (English always bundled)
import en from "@/locales/en.json"
import { SUPPORTED_LANGUAGES, isSupportedLanguage } from "./languages"
import type { LanguageCode } from "./languages"

export { SUPPORTED_LANGUAGES, isSupportedLanguage }
export type { LanguageCode }

// Where the reader's choice is cached between loads. The preference the server
// holds is the real answer; this is read on the way to the first paint, which
// happens before the preferences request comes back.
const LANGUAGE_STORAGE_KEY = "nibbler-language"

/**
 * The language to run in, given a stored preference.
 *
 * "" is how "browser default" is stored, and a code for a language no longer
 * bundled reads the same way: fall through to what the browser asks for.
 */
export function resolveLanguage(preference?: string | null): LanguageCode {
  if (isSupportedLanguage(preference)) {
    return preference
  }

  const browserLanguage = navigator.language.split("-")[0]
  return isSupportedLanguage(browserLanguage) ? browserLanguage : "en"
}

export function readStoredLanguage(): LanguageCode | undefined {
  if (typeof window === "undefined") return undefined

  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  return isSupportedLanguage(stored) ? stored : undefined
}

/** Cache a preference for the next first paint. "" clears the cache. */
export function storeLanguage(preference?: string | null): void {
  if (typeof window === "undefined") return

  if (isSupportedLanguage(preference)) {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, preference)
  } else {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY)
  }
}

export function initI18n(savedLanguage?: string) {
  const language = resolveLanguage(savedLanguage)

  // i18n is a module singleton and this runs from a mount effect, so remounts
  // reach it more than once. Calling init() again rebuilds the resource store,
  // which drops every bundle added since the first call.
  if (i18n.isInitialized) {
    i18n.changeLanguage(language)
    return i18n
  }

  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
    },
    lng: language,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false, // React already handles escaping
    },
    // Don't show missing key warnings in production
    saveMissing: false,
    missingKeyHandler: false,
  })

  return i18n
}

/** Put the interface in the language a stored preference names. */
export function applyLanguage(preference?: string | null) {
  const language = resolveLanguage(preference)

  // Preferences can land before I18nProvider's mount effect has run; i18next
  // throws on changeLanguage() before init, so start it on the right language
  // instead of dropping the value.
  if (!i18n.isInitialized) {
    return Promise.resolve(initI18n(language))
  }

  return i18n.changeLanguage(language)
}

export { i18n }
