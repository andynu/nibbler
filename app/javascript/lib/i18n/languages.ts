/**
 * The languages the interface is offered in.
 *
 * Separate from ./index so a test can substitute a wider catalog. The app
 * bundles one locale, and with one locale every language change resolves back
 * to English, which would leave the picker's wiring with no observable effect
 * to assert on.
 */
export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  // Future: { code: "es", name: "Español" },
  // Future: { code: "de", name: "Deutsch" },
] as const

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]["code"]

export function isSupportedLanguage(
  code: string | null | undefined
): code is LanguageCode {
  return !!code && SUPPORTED_LANGUAGES.some((language) => language.code === code)
}
