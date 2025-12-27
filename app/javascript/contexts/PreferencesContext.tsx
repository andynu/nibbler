import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"
import { api, Preferences } from "@/lib/api"
import { applyAccentColors, DEFAULT_ACCENT_HUE } from "@/lib/accentColors"

interface PreferencesContextValue {
  preferences: Preferences
  isLoading: boolean
  updatePreference: (key: keyof Preferences, value: string) => Promise<void>
  updatePreferences: (updates: Partial<Preferences>) => Promise<void>
}

const defaultPreferences: Preferences = {
  show_content_preview: "true",
  strip_images: "false",
  default_update_interval: "30",
  confirm_feed_catchup: "true",
  default_view_mode: "adaptive",
  default_view_limit: "30",
  fresh_article_max_age: "24",
  date_format: "relative",
  hide_read_feeds: "false",
  hide_read_shows_special: "true",
  feeds_sort_by_unread: "false",
  purge_old_days: "60",
  purge_unread_articles: "false",
  theme: "system",
  accent_hue: "210",
  sidebar_collapsed: "false",
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadPreferences()
  }, [])

  const loadPreferences = async () => {
    try {
      const data = await api.preferences.get()
      setPreferences(data)
      // Apply accent colors when preferences are loaded
      const hue = parseInt(data.accent_hue, 10) || DEFAULT_ACCENT_HUE
      applyAccentColors(hue)
    } catch (error) {
      console.error("Failed to load preferences:", error)
      // Apply default accent colors on error
      applyAccentColors(DEFAULT_ACCENT_HUE)
    } finally {
      setIsLoading(false)
    }
  }

  const updatePreference = useCallback(async (key: keyof Preferences, value: string) => {
    const update = { [key]: value } as Partial<Preferences>
    setPreferences((prev) => ({ ...prev, ...update }))
    try {
      await api.preferences.update(update)
    } catch (error) {
      console.error("Failed to update preference:", error)
      loadPreferences()
    }
  }, [])

  const updatePreferences = useCallback(async (updates: Partial<Preferences>) => {
    setPreferences((prev) => ({ ...prev, ...updates }))
    try {
      await api.preferences.update(updates)
    } catch (error) {
      console.error("Failed to update preferences:", error)
      loadPreferences()
    }
  }, [])

  return (
    <PreferencesContext.Provider value={{ preferences, isLoading, updatePreference, updatePreferences }}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (!context) {
    throw new Error("usePreferences must be used within a PreferencesProvider")
  }
  return context
}
