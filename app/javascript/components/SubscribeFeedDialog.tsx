import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api, Feed, Category, FeedPreview } from "@/lib/api"
import { Loader2, CheckCircle, XCircle, Rss } from "lucide-react"

interface SubscribeFeedDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  onFeedCreated: (feed: Feed) => void
  initialUrl?: string
}

export function SubscribeFeedDialog({
  open,
  onOpenChange,
  categories,
  onFeedCreated,
  initialUrl,
}: SubscribeFeedDialogProps) {
  const [feedUrl, setFeedUrl] = useState(initialUrl || "")

  useEffect(() => {
    if (open && initialUrl) {
      setFeedUrl(initialUrl)
    }
  }, [open, initialUrl])
  const [title, setTitle] = useState("")
  const [categoryId, setCategoryId] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<FeedPreview | null>(null)

  const handleTest = async () => {
    setError(null)
    setPreview(null)
    setIsTesting(true)

    try {
      const result = await api.feeds.preview(feedUrl)
      setPreview(result)
      // Auto-fill title if empty
      if (!title && result.title) {
        setTitle(result.title)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch feed")
    } finally {
      setIsTesting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const feed = await api.feeds.create({
        feed: {
          feed_url: feedUrl,
          title: title || undefined,
          category_id: categoryId && categoryId !== "none" ? parseInt(categoryId, 10) : undefined,
        },
      })
      onFeedCreated(feed)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to subscribe to feed")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setFeedUrl("")
    setTitle("")
    setCategoryId("")
    setError(null)
    setPreview(null)
    onOpenChange(false)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Unknown"
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    } catch {
      return dateStr
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Subscribe to Feed</DialogTitle>
            <DialogDescription>
              Enter a feed URL to subscribe. The title will be auto-detected if left empty.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="feedUrl">Feed URL</Label>
              <div className="flex gap-2">
                <Input
                  id="feedUrl"
                  type="url"
                  placeholder="https://example.com/feed.xml"
                  value={feedUrl}
                  onChange={(e) => {
                    setFeedUrl(e.target.value)
                    setPreview(null) // Clear preview when URL changes
                  }}
                  required
                  autoFocus
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTest}
                  disabled={isTesting || !feedUrl}
                >
                  {isTesting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Test"
                  )}
                </Button>
              </div>
            </div>

            {preview && (
              <div className="rounded-md border bg-muted/50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="font-medium">Feed found</span>
                </div>
                <div className="grid gap-1 text-sm">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground">Title:</span>
                    <span className="font-medium">{preview.title}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground">Entries:</span>
                    <span>{preview.entry_count} articles</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground">Last updated:</span>
                    <span>{formatDate(preview.last_updated)}</span>
                  </div>
                  {preview.sample_entries.length > 0 && (
                    <div className="mt-2 pt-2 border-t">
                      <span className="text-muted-foreground text-xs">Recent articles:</span>
                      <ul className="mt-1 space-y-0.5">
                        {preview.sample_entries.map((entry, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs">
                            <Rss className="h-3 w-3 mt-0.5 text-muted-foreground flex-shrink-0" />
                            <span className="line-clamp-1">{entry.title}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="title">Title (optional)</Label>
              <Input
                id="title"
                type="text"
                placeholder="Auto-detect from feed"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {category.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && (
              <div className="text-sm text-destructive">{error}</div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !feedUrl}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Subscribe
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
