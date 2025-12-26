import { useState } from "react"
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
import { api, Feed, Category } from "@/lib/api"
import { Loader2 } from "lucide-react"

interface SubscribeFeedDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  onFeedCreated: (feed: Feed) => void
}

export function SubscribeFeedDialog({
  open,
  onOpenChange,
  categories,
  onFeedCreated,
}: SubscribeFeedDialogProps) {
  const [feedUrl, setFeedUrl] = useState("")
  const [title, setTitle] = useState("")
  const [categoryId, setCategoryId] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const feed = await api.feeds.create({
        feed: {
          feed_url: feedUrl,
          title: title || undefined,
          category_id: categoryId ? parseInt(categoryId, 10) : undefined,
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
    onOpenChange(false)
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
              <Input
                id="feedUrl"
                type="url"
                placeholder="https://example.com/feed.xml"
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                required
                autoFocus
              />
            </div>
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
                  <SelectItem value="">No category</SelectItem>
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
