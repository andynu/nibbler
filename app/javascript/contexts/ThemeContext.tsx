import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react"
import { api } from "@/lib/api"
import {
  DARK_MEDIA_QUERY,
  ThemeBase,
  ThemeDefinition,
  ThemeSelection,
  applyTheme,
  normalizeThemeSelection,
  readStoredTheme,
  resolveTheme,
  storeTheme,
} from "@/lib/themes"

interface ThemeContextValue {
  /** What the user picked: a theme id, or "system". */
  theme: ThemeSelection
  /**
   * Base of the applied palette. Consumers that only need to know whether the
   * UI is currently dark (inline styles picking a light or dark variant) read
   * this and stay correct as palettes are added.
   */
  resolvedTheme: ThemeBase
  /** Id of the applied palette. Differs from `theme` when `theme` is "system". */
  resolvedThemeId: string
  /** Full definition of the applied palette. */
  resolvedThemeDefinition: ThemeDefinition
  /**
   * Record the reader's choice: applies it, caches it, and stores it on the
   * account. Every control that changes the theme goes through here, so the
   * choice reaches the server whatever the control looks like.
   */
  setTheme: (theme: ThemeSelection) => void
  /**
   * Apply the theme the account already holds, without writing it back.
   * PreferencesContext calls this when the preferences request lands.
   */
  adoptServerTheme: (theme: unknown) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false
  }
  return window.matchMedia(DARK_MEDIA_QUERY).matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start on the cached choice. This provider sits above PreferencesProvider
  // and paints before the preferences request comes back; the account's theme
  // replaces this as soon as it does.
  const [theme, setThemeState] = useState<ThemeSelection>(() =>
    normalizeThemeSelection(readStoredTheme())
  )
  const [prefersDark, setPrefersDark] = useState<boolean>(getSystemPrefersDark)

  const resolvedThemeDefinition = resolveTheme(theme, prefersDark)

  // Apply the resolved palette to the document root
  useEffect(() => {
    applyTheme(document.documentElement, resolvedThemeDefinition)
  }, [resolvedThemeDefinition])

  // Track the OS preference. Watched unconditionally: a pinned theme ignores
  // the value, so there is nothing to re-subscribe when the selection changes.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return
    }

    const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY)
    const handleChange = () => setPrefersDark(mediaQuery.matches)

    handleChange()
    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [])

  // The account is the copy that lasts, so the choice is written there rather
  // than only to the cache. The write lives here rather than in the picker so
  // that a redesigned picker, or any other control, cannot lose it.
  const setTheme = (newTheme: ThemeSelection) => {
    const selection = normalizeThemeSelection(newTheme)
    setThemeState(selection)
    storeTheme(selection)
    api.preferences.update({ theme: selection }).catch((error) => {
      console.error("Failed to store theme preference:", error)
    })
  }

  // What the account holds, arriving once the preferences request lands. Also
  // refreshes the cache, so the two cannot drift.
  const adoptServerTheme = useCallback((serverTheme: unknown) => {
    const selection = normalizeThemeSelection(serverTheme)
    setThemeState(selection)
    storeTheme(selection)
  }, [])

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme: resolvedThemeDefinition.base,
        resolvedThemeId: resolvedThemeDefinition.id,
        resolvedThemeDefinition,
        setTheme,
        adoptServerTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
