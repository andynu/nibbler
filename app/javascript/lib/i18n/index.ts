import i18n from "i18next"
import { initReactI18next } from "react-i18next"

// Import translations directly (English always bundled)
import en from "@/locales/en.json"

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  // Future: { code: "es", name: "Español" },
  // Future: { code: "de", name: "Deutsch" },
] as const

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]["code"]

// Detect preferred language
function detectLanguage(savedLanguage?: string): LanguageCode {
  // 1. User preference (from settings)
  if (savedLanguage && SUPPORTED_LANGUAGES.some((l) => l.code === savedLanguage)) {
    return savedLanguage as LanguageCode
  }

  // 2. Browser language
  const browserLang = navigator.language.split("-")[0]
  if (SUPPORTED_LANGUAGES.some((l) => l.code === browserLang)) {
    return browserLang as LanguageCode
  }

  // 3. Default to English
  return "en"
}

export function initI18n(savedLanguage?: string) {
  const detectedLanguage = detectLanguage(savedLanguage)

  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
    },
    lng: detectedLanguage,
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

export function changeLanguage(language: LanguageCode) {
  return i18n.changeLanguage(language)
}

export { i18n }
