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
    </div>
  )
}
