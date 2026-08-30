import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Check, Copy, RefreshCw, Rss, AlertTriangle } from "lucide-react"
import { api } from "@/lib/api"

export function AccountPanel() {
  const [feedUrl, setFeedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadFeedKey()
  }, [])

  const loadFeedKey = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.auth.publicFeedKey()
      setFeedUrl(data.feed_url)
    } catch (err) {
      setError("Failed to load public feed URL")
      console.error("Failed to load public feed key:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!feedUrl) return
    try {
      await navigator.clipboard.writeText(feedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const handleRegenerate = async () => {
    if (!confirmReset) {
      setConfirmReset(true)
      setTimeout(() => setConfirmReset(false), 3000)
      return
    }

    try {
      setRegenerating(true)
      setError(null)
      const data = await api.auth.regeneratePublicFeedKey()
      setFeedUrl(data.feed_url)
      setConfirmReset(false)
    } catch (err) {
      setError("Failed to regenerate feed key")
      console.error("Failed to regenerate feed key:", err)
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rss className="h-5 w-5" />
            Public Feed
          </CardTitle>
          <CardDescription>
            Share your published articles as an Atom feed. Anyone with this URL can subscribe
            to articles you mark as "published" in their feed reader.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive-text">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label>Feed URL</Label>
            <div className="flex gap-2">
              <Input
                value={loading ? "Loading..." : (feedUrl || "")}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                disabled={loading || !feedUrl}
                title="Copy to clipboard"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant={confirmReset ? "destructive" : "outline"}
              onClick={handleRegenerate}
              disabled={loading || regenerating}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${regenerating ? "animate-spin" : ""}`} />
              {confirmReset ? "Click again to confirm" : "Reset URL"}
            </Button>
            {confirmReset && (
              <span className="text-sm text-muted-foreground">
                This will invalidate the old URL
              </span>
            )}
          </div>

          <div className="text-sm text-muted-foreground space-y-1">
            <p><strong>How it works:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Click the RSS icon on any article to add it to your public feed</li>
              <li>You can also use filters with a "publish" action for automation</li>
              <li>Share the URL with others so they can subscribe</li>
              <li>Reset the URL if you want to revoke access</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
