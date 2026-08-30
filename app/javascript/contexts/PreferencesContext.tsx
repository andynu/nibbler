import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"
import { api, Preferences } from "@/lib/api"
import { applyAccentColors, DEFAULT_ACCENT_HUE } from "@/lib/accentColors"
import { applyLanguage, readStoredLanguage, storeLanguage } from "@/lib/i18n"
import { SYSTEM_THEME, readStoredTheme } from "@/lib/themes"
import { useTheme } from "@/contexts/ThemeContext"

interface PreferencesContextValue {
  preferences: Preferences
  isLoading: boolean
  updatePreference: (key: keyof Preferences, value: string) => Promise<void>
  updatePreferences: (updates: Partial<Preferences>) => Promise<void>
}

const defaultPreferences: Preferences = {
  show_content_preview: "true",
  strip_images: "false",
  content_view_mode: "rss",
  default_update_interval: "30",
  confirm_feed_catchup: "true",
  default_view_mode: "adaptive",
  default_view_limit: "30",
  fresh_article_max_age: "24",
  date_format: "relative",
  hide_read_feeds: "false",
  hide_read_shows_special: "true",
  feeds_sort_by_unread: "false",
  entries_sort_by_score: "false",
  // entries_sort_config is deliberately absent, matching the API, which has no
  // default for it either. Claiming "date:desc" here made the value change from
  // a string to undefined the moment the real preferences landed, for a sort
  // that had not actually moved. Readers resolve the sort through
  // entries_sort_by_score when this key is missing, which lands on "date:desc"
  // anyway.
  entries_hide_read: "false",
  entries_hide_unstarred: "false",
  entries_display_density: "medium",
  purge_old_days: "60",
  purge_unread_articles: "false",
  theme: "system",
  accent_hue: "210",
  sidebar_collapsed: "false",
  sync_to_tree: "false",
  user_language: "",
  tts_playback_speed: "1",
  // Email digest preferences
  digest_enable: "false",
  digest_preferred_time: "08:00",
  digest_catchup: "false",
  digest_min_score: "0",
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences)
  const [isLoading, setIsLoading] = useState(true)
  // Preferences are loaded here and handed to whatever applies them: accent
  // colours and language through module functions, theme through the provider
  // that holds it. ThemeProvider is above this one in the tree, since it paints
  // the login form too, so this reads its context rather than owning the state.
  const { theme: appliedTheme, adoptServerTheme } = useTheme()

  useEffect(() => {
    loadPreferences()
  }, [])

  // preferences.theme is the stored form of what ThemeContext applies. Mirror
  // it so a reader of the preference cannot be handed a theme the app is not
  // in; the write to the server is ThemeContext's, not another update here.
  useEffect(() => {
    setPreferences((prev) =>
      prev.theme === appliedTheme ? prev : { ...prev, theme: appliedTheme }
    )
  }, [appliedTheme])

  // The language a reader chose before the choice was stored server-side
  // exists only in their browser. Reading "" back from the server and acting on
  // it would silently put them in English on their next load, so adopt what
  // the browser still holds and write it to the server, once. The picker
  // clears that cache when the reader chooses "Browser default", which is what
  // keeps this from undoing that choice.
  const adoptStoredLanguage = async (serverLanguage: string): Promise<string> => {
    if (serverLanguage) return serverLanguage

    const cached = readStoredLanguage()
    if (!cached) return ""

    try {
      await api.preferences.update({ user_language: cached })
    } catch (error) {
      console.error("Failed to store cached language preference:", error)
    }
    return cached
  }

  // Same shape for the theme, and for the same reason: the choice was kept in
  // localStorage and nowhere else until it became a preference, so a reader
  // who picked one has it only in their browser. "system" is what the account
  // reports when nothing was ever stored, so that is the one value a cached
  // theme is allowed to replace. An id this build does not know is left alone
  // rather than overwritten: it may be a palette a newer build wrote.
  const adoptStoredTheme = async (serverTheme: string): Promise<string> => {
    if (serverTheme && serverTheme !== SYSTEM_THEME) return serverTheme

    const cached = readStoredTheme()
    if (!cached || cached === SYSTEM_THEME) return SYSTEM_THEME

    try {
      await api.preferences.update({ theme: cached })
    } catch (error) {
      console.error("Failed to store cached theme preference:", error)
    }
    return cached
  }

  const loadPreferences = async () => {
    try {
      const data = await api.preferences.get()
      const language = await adoptStoredLanguage(data.user_language)
      const theme = await adoptStoredTheme(data.theme)
      setPreferences({ ...data, user_language: language, theme })
      // Apply accent colors when preferences are loaded
      const hue = parseInt(data.accent_hue, 10) || DEFAULT_ACCENT_HUE
      applyAccentColors(hue)
      // The account is the answer for both of these; localStorage is a cache
      // of each, kept only so the paint before this request returns is in the
      // right palette and the right language.
      adoptServerTheme(theme)
      storeLanguage(language)
      await applyLanguage(language)
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
