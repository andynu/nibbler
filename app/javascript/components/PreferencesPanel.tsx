import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { usePreferences } from "@/contexts/PreferencesContext"

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
    </div>
  )
}
