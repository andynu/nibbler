import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { initI18n, changeLanguage, SUPPORTED_LANGUAGES, LanguageCode } from "@/lib/i18n"
import { usePreferences } from "@/contexts/PreferencesContext"

interface I18nContextValue {
  currentLanguage: LanguageCode
  supportedLanguages: typeof SUPPORTED_LANGUAGES
  setLanguage: (language: LanguageCode) => Promise<void>
  isInitialized: boolean
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const { preferences, updatePreference, isLoading: prefsLoading } = usePreferences()
  const { i18n } = useTranslation()
  const [isInitialized, setIsInitialized] = useState(false)

  // Initialize i18n once preferences are loaded
  useEffect(() => {
    if (!prefsLoading && !isInitialized) {
      const savedLanguage = preferences.user_language || undefined
      initI18n(savedLanguage)
      setIsInitialized(true)
    }
  }, [prefsLoading, isInitialized, preferences.user_language])

  // Sync language when preference changes
  useEffect(() => {
    if (isInitialized && preferences.user_language) {
      if (i18n.language !== preferences.user_language) {
        changeLanguage(preferences.user_language as LanguageCode)
      }
    }
  }, [isInitialized, preferences.user_language, i18n.language])

  const setLanguage = async (language: LanguageCode) => {
    await changeLanguage(language)
    await updatePreference("user_language", language)
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
