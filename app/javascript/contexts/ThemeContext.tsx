import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import {
  DARK_MEDIA_QUERY,
  SYSTEM_THEME,
  ThemeBase,
  ThemeDefinition,
  ThemeSelection,
  applyTheme,
  normalizeThemeSelection,
  resolveTheme,
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
  setTheme: (theme: ThemeSelection) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const THEME_STORAGE_KEY = "nibbler-theme"

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false
  }
  return window.matchMedia(DARK_MEDIA_QUERY).matches
}

function getStoredTheme(): ThemeSelection {
  if (typeof window === "undefined") return SYSTEM_THEME
  return normalizeThemeSelection(localStorage.getItem(THEME_STORAGE_KEY))
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeSelection>(getStoredTheme)
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

  const setTheme = (newTheme: ThemeSelection) => {
    setThemeState(newTheme)
    localStorage.setItem(THEME_STORAGE_KEY, newTheme)
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme: resolvedThemeDefinition.base,
        resolvedThemeId: resolvedThemeDefinition.id,
        resolvedThemeDefinition,
        setTheme,
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
