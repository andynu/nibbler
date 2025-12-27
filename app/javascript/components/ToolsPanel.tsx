import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Check, Copy, GripVertical } from "lucide-react"

export function ToolsPanel() {
  const [copied, setCopied] = useState(false)

  // Get base URL for the bookmarklet
  const baseUrl = window.location.origin

  // Bookmarklet that:
  // 1. Tries to find RSS/Atom link tags in the page
  // 2. Falls back to current page URL
  // 3. Opens TTRB subscribe dialog with the feed URL
  const bookmarkletCode = `javascript:(function(){
  var feedUrl = null;
  var links = document.querySelectorAll('link[type="application/rss+xml"], link[type="application/atom+xml"], link[rel="alternate"][type*="rss"], link[rel="alternate"][type*="atom"]');
  if (links.length > 0) {
    if (links.length === 1) {
      feedUrl = links[0].href;
    } else {
      var titles = [];
      for (var i = 0; i < links.length; i++) {
        titles.push((i+1) + '. ' + (links[i].title || links[i].href));
      }
      var choice = prompt('Multiple feeds found. Enter number:\\n' + titles.join('\\n'), '1');
      if (choice) {
        var idx = parseInt(choice, 10) - 1;
        if (idx >= 0 && idx < links.length) {
          feedUrl = links[idx].href;
        }
      }
    }
  }
  if (!feedUrl) {
    feedUrl = window.location.href;
  }
  window.open('${baseUrl}?subscribe=' + encodeURIComponent(feedUrl), '_blank');
})();`

  const minifiedBookmarklet = bookmarkletCode
    .replace(/\n/g, "")
    .replace(/  +/g, " ")

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(minifiedBookmarklet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  return (
    <div className="p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GripVertical className="h-5 w-5" />
            Subscribe Bookmarklet
          </CardTitle>
          <CardDescription>
            Drag this button to your bookmarks bar to quickly subscribe to feeds from any page.
            The bookmarklet will automatically detect RSS/Atom feeds linked in the page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <a
              href={minifiedBookmarklet}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
              onClick={(e) => e.preventDefault()}
              draggable
            >
              Subscribe to TTRB
            </a>
            <span className="text-sm text-muted-foreground">
              Drag to your bookmarks bar
            </span>
          </div>

          <div className="space-y-2">
            <Label>Or copy the bookmarklet code:</Label>
            <div className="flex gap-2">
              <Input
                value={minifiedBookmarklet}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                title="Copy to clipboard"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="text-sm text-muted-foreground space-y-1">
            <p><strong>How it works:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Detects RSS/Atom feed links in the current page</li>
              <li>If multiple feeds are found, prompts you to choose</li>
              <li>If no feed is detected, uses the current page URL</li>
              <li>Opens TTRB with the subscribe dialog pre-filled</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
