import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  initI18n,
  applyLanguage,
  readStoredLanguage,
  storeLanguage,
  SUPPORTED_LANGUAGES,
  LanguageCode,
} from "@/lib/i18n"

/** The stored form of "browser default": no language named. */
export type LanguagePreference = LanguageCode | ""

interface I18nContextValue {
  currentLanguage: LanguageCode
  supportedLanguages: typeof SUPPORTED_LANGUAGES
  setLanguage: (language: LanguagePreference) => Promise<void>
  isInitialized: boolean
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation()
  const [isInitialized, setIsInitialized] = useState(false)

  // Start on the cached choice. PreferencesContext overrides this with the
  // server's user_language as soon as the preferences request comes back; the
  // cache exists only to keep the paint before that from being in English.
  useEffect(() => {
    if (!isInitialized) {
      initI18n(readStoredLanguage())
      setIsInitialized(true)
    }
  }, [isInitialized])

  // Changes the language now and updates the cache. Storing the preference
  // server-side is the caller's job, since that is the copy that lasts.
  // Passing "" clears the cache, without which the next load would come back
  // in the language the reader just turned off.
  const setLanguage = async (language: LanguagePreference) => {
    storeLanguage(language)
    await applyLanguage(language)
  }

  const value: I18nContextValue = {
    currentLanguage: (i18n.language || "en") as LanguageCode,
    supportedLanguages: SUPPORTED_LANGUAGES,
    setLanguage,
    isInitialized,
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider")
  }
  return context
}
