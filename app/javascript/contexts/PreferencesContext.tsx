import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"
import { api, Preferences } from "@/lib/api"

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
    } catch (error) {
      console.error("Failed to load preferences:", error)
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
