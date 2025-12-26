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

export function PreferencesPanel() {
  const { preferences, updatePreference, isLoading } = usePreferences()

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
    </div>
  )
}
