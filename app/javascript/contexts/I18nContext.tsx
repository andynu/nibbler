import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { initI18n, changeLanguage, SUPPORTED_LANGUAGES, LanguageCode } from "@/lib/i18n"

interface I18nContextValue {
  currentLanguage: LanguageCode
  supportedLanguages: typeof SUPPORTED_LANGUAGES
  setLanguage: (language: LanguageCode) => Promise<void>
  isInitialized: boolean
}

const I18nContext = createContext<I18nContextValue | null>(null)

const LANGUAGE_STORAGE_KEY = "nibbler-language"

function getStoredLanguage(): LanguageCode | undefined {
  if (typeof window === "undefined") return undefined
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (stored && SUPPORTED_LANGUAGES.some(l => l.code === stored)) {
    return stored as LanguageCode
  }
  return undefined
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation()
  const [isInitialized, setIsInitialized] = useState(false)

  // Initialize i18n on mount
  useEffect(() => {
    if (!isInitialized) {
      const savedLanguage = getStoredLanguage()
      initI18n(savedLanguage)
      setIsInitialized(true)
    }
  }, [isInitialized])

  const setLanguage = async (language: LanguageCode) => {
    await changeLanguage(language)
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
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
