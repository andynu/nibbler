import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePreferences } from "@/contexts/PreferencesContext"
import { useTheme } from "@/contexts/ThemeContext"
import { useI18n } from "@/contexts/I18nContext"
import { applyAccentColors, generateAccentColors, DEFAULT_ACCENT_HUE } from "@/lib/accentColors"
import type { LanguageCode } from "@/lib/i18n"

const UPDATE_INTERVAL_OPTIONS = [
  { value: "15", label: "Every 15 minutes" },
  { value: "30", label: "Every 30 minutes" },
  { value: "60", label: "Every hour" },
  { value: "120", label: "Every 2 hours" },
  { value: "360", label: "Every 6 hours" },
  { value: "720", label: "Every 12 hours" },
  { value: "1440", label: "Every 24 hours" },
  { value: "10080", label: "Weekly" },
]

const VIEW_MODE_OPTIONS = [
  { value: "adaptive", label: "Adaptive (unread if any, else all)" },
  { value: "unread", label: "Unread only" },
  { value: "all", label: "All articles" },
  { value: "starred", label: "Starred" },
]

const VIEW_LIMIT_OPTIONS = [
  { value: "15", label: "15 articles" },
  { value: "30", label: "30 articles" },
  { value: "50", label: "50 articles" },
  { value: "100", label: "100 articles" },
]

const FRESH_AGE_OPTIONS = [
  { value: "6", label: "6 hours" },
  { value: "12", label: "12 hours" },
  { value: "24", label: "24 hours" },
  { value: "48", label: "48 hours" },
  { value: "72", label: "72 hours" },
  { value: "168", label: "1 week" },
]

const DATE_FORMAT_OPTIONS = [
  { value: "relative", label: "Relative (2h ago)" },
  { value: "short", label: "Short (Dec 26, 14:30)" },
  { value: "long", label: "Long (Thu, Dec 26, 2024)" },
  { value: "iso", label: "ISO (2024-12-26 14:30)" },
]

const PURGE_DAYS_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
  { value: "0", label: "Never" },
]

const THEME_OPTIONS = [
  { value: "system", label: "System (auto)" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

const CONTENT_VIEW_MODE_OPTIONS = [
  { value: "rss", label: "RSS content (default)" },
  { value: "iframe", label: "Original page in iframe" },
]

export function PreferencesPanel() {
  const { preferences, updatePreference, isLoading } = usePreferences()
  const { theme, setTheme } = useTheme()
  const { currentLanguage, supportedLanguages, setLanguage, isInitialized: i18nInitialized } = useI18n()

  if (isLoading) {
    return (
      <div className="p-4 text-muted-foreground">
        Loading preferences...
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">Appearance</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="theme">Theme</Label>
              <p className="text-sm text-muted-foreground">
                Choose light, dark, or follow your system settings
              </p>
            </div>
            <Select
              value={theme}
              onValueChange={(value) => setTheme(value as "light" | "dark" | "system")}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THEME_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="accent_hue">Accent color</Label>
              <p className="text-sm text-muted-foreground">
                Choose the accent color for highlights and icons
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                id="accent_hue"
                min="0"
                max="360"
                value={preferences.accent_hue || DEFAULT_ACCENT_HUE}
                onChange={(e) => {
                  const hue = parseInt(e.target.value, 10)
                  applyAccentColors(hue)
                  updatePreference("accent_hue", String(hue))
                }}
                className="w-32 h-2 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right,
                    hsl(0, 70%, 50%),
                    hsl(60, 70%, 50%),
                    hsl(120, 70%, 50%),
                    hsl(180, 70%, 50%),
                    hsl(240, 70%, 50%),
                    hsl(300, 70%, 50%),
                    hsl(360, 70%, 50%)
                  )`,
                }}
              />
              <div
                className="w-8 h-8 rounded-md border"
                style={{
                  backgroundColor: generateAccentColors(
                    parseInt(preferences.accent_hue || String(DEFAULT_ACCENT_HUE), 10)
                  ).primary,
                }}
              />
            </div>
          </div>

          {i18nInitialized && (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="language">Language</Label>
                <p className="text-sm text-muted-foreground">
                  Interface language (browser default if not set)
                </p>
              </div>
              <Select
                value={preferences.user_language || "auto"}
                onValueChange={(value) => {
                  if (value === "auto") {
                    updatePreference("user_language", "")
                  } else {
                    setLanguage(value as LanguageCode)
                  }
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Browser default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Browser default</SelectItem>
                  {supportedLanguages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-4">Article Display</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="show_content_preview">Show content preview</Label>
              <p className="text-sm text-muted-foreground">
                Display a snippet of article content in the article list
              </p>
            </div>
            <Switch
              id="show_content_preview"
              checked={preferences.show_content_preview === "true"}
              onCheckedChange={(checked) =>
                updatePreference("show_content_preview", checked ? "true" : "false")
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="strip_images">Hide images in articles</Label>
              <p className="text-sm text-muted-foreground">
                Remove images from article content when reading
              </p>
            </div>
            <Switch
              id="strip_images"
              checked={preferences.strip_images === "true"}
              onCheckedChange={(checked) =>
                updatePreference("strip_images", checked ? "true" : "false")
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="content_view_mode">Default article view</Label>
              <p className="text-sm text-muted-foreground">
                Show RSS content or the original page in an iframe (toggle with 'i')
              </p>
            </div>
            <Select
              value={preferences.content_view_mode || "rss"}
              onValueChange={(value) => updatePreference("content_view_mode", value)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_VIEW_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="date_format">Date format</Label>
              <p className="text-sm text-muted-foreground">
                How dates are displayed in the article list
              </p>
            </div>
            <Select
              value={preferences.date_format}
              onValueChange={(value) => updatePreference("date_format", value)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMAT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-4">Feed Updates</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="default_update_interval">Default update interval</Label>
              <p className="text-sm text-muted-foreground">
                How often to check feeds for new articles (individual feeds can override)
              </p>
            </div>
            <Select
              value={preferences.default_update_interval}
              onValueChange={(value) => updatePreference("default_update_interval", value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UPDATE_INTERVAL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-4">Reading Behavior</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="confirm_feed_catchup">Confirm mark all read</Label>
              <p className="text-sm text-muted-foreground">
                Show confirmation dialog before marking all articles as read
              </p>
            </div>
            <Switch
              id="confirm_feed_catchup"
              checked={preferences.confirm_feed_catchup === "true"}
              onCheckedChange={(checked) =>
                updatePreference("confirm_feed_catchup", checked ? "true" : "false")
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="default_view_mode">Default article filter</Label>
              <p className="text-sm text-muted-foreground">
                Which articles to show when selecting a feed
              </p>
            </div>
            <Select
              value={preferences.default_view_mode}
              onValueChange={(value) => updatePreference("default_view_mode", value)}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIEW_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="default_view_limit">Articles per page</Label>
              <p className="text-sm text-muted-foreground">
                Number of articles to load at a time
              </p>
            </div>
            <Select
              value={preferences.default_view_limit}
              onValueChange={(value) => updatePreference("default_view_limit", value)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIEW_LIMIT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="fresh_article_max_age">Fresh articles age</Label>
              <p className="text-sm text-muted-foreground">
                Articles newer than this appear in the Fresh view
              </p>
            </div>
            <Select
              value={preferences.fresh_article_max_age}
              onValueChange={(value) => updatePreference("fresh_article_max_age", value)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FRESH_AGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-4">Data Management</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="purge_old_days">Purge old articles</Label>
              <p className="text-sm text-muted-foreground">
                Automatically remove old articles after this many days.
                Starred and published articles are never purged.
              </p>
            </div>
            <Select
              value={preferences.purge_old_days}
              onValueChange={(value) => updatePreference("purge_old_days", value)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PURGE_DAYS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="purge_unread_articles">Purge unread articles</Label>
              <p className="text-sm text-muted-foreground">
                Also purge articles that haven't been read yet
              </p>
            </div>
            <Switch
              id="purge_unread_articles"
              checked={preferences.purge_unread_articles === "true"}
              onCheckedChange={(checked) =>
                updatePreference("purge_unread_articles", checked ? "true" : "false")
              }
              disabled={preferences.purge_old_days === "0"}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
