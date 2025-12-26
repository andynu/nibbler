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
import { api, Feed, Category } from "@/lib/api"
import { usePreferences } from "@/contexts/PreferencesContext"
import { Loader2, AlertCircle, RefreshCw, Trash2 } from "lucide-react"

const UPDATE_INTERVAL_OPTIONS = [
  { value: "0", label: "Use default" },
  { value: "15", label: "Every 15 minutes" },
  { value: "30", label: "Every 30 minutes" },
  { value: "60", label: "Every hour" },
  { value: "120", label: "Every 2 hours" },
  { value: "360", label: "Every 6 hours" },
  { value: "720", label: "Every 12 hours" },
  { value: "1440", label: "Every 24 hours" },
  { value: "10080", label: "Weekly" },
]

interface EditFeedDialogProps {
  feed: Feed | null
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  onFeedUpdated: (feed: Feed) => void
  onFeedDeleted: (feedId: number) => void
}

export function EditFeedDialog({
  feed,
  open,
  onOpenChange,
  categories,
  onFeedUpdated,
  onFeedDeleted,
}: EditFeedDialogProps) {
  const { preferences } = usePreferences()
  const [title, setTitle] = useState("")
  const [categoryId, setCategoryId] = useState<string>("")
  const [updateInterval, setUpdateInterval] = useState<string>("0")
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (feed) {
      setTitle(feed.title)
      setCategoryId(feed.category_id ? String(feed.category_id) : "")
      setUpdateInterval(String(feed.update_interval ?? 0))
      setError(null)
      setShowDeleteConfirm(false)
    }
  }, [feed])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!feed) return

    setError(null)
    setIsLoading(true)

    try {
      const updatedFeed = await api.feeds.update(feed.id, {
        feed: {
          title,
          category_id: categoryId ? parseInt(categoryId, 10) : null,
          update_interval: parseInt(updateInterval, 10),
        },
      })
      onFeedUpdated(updatedFeed)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update feed")
    } finally {
      setIsLoading(false)
    }
  }

  // Get the label for the default interval from preferences
  const getDefaultIntervalLabel = () => {
    const defaultMinutes = preferences.default_update_interval
    const option = UPDATE_INTERVAL_OPTIONS.find((o) => o.value === defaultMinutes)
    return option ? option.label.replace("Every ", "") : `${defaultMinutes} minutes`
  }

  const handleRefresh = async () => {
    if (!feed) return

    setIsRefreshing(true)
    setError(null)

    try {
      const result = await api.feeds.refresh(feed.id)
      onFeedUpdated(result.feed)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh feed")
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleDelete = async () => {
    if (!feed) return

    setIsDeleting(true)
    setError(null)

    try {
      await api.feeds.delete(feed.id)
      onFeedDeleted(feed.id)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete feed")
      setIsDeleting(false)
    }
  }

  const handleClose = () => {
    setShowDeleteConfirm(false)
    onOpenChange(false)
  }

  if (!feed) return null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Feed</DialogTitle>
            <DialogDescription>
              Update feed settings or manage subscription.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="feedUrl">Feed URL</Label>
              <Input
                id="feedUrl"
                type="url"
                value={feed.feed_url}
                disabled
                className="text-muted-foreground"
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
            <div className="space-y-2">
              <Label htmlFor="updateInterval">Update interval</Label>
              <Select value={updateInterval} onValueChange={setUpdateInterval}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UPDATE_INTERVAL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.value === "0"
                        ? `Use default (${getDefaultIntervalLabel()})`
                        : option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {feed.last_error && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Last Error</div>
                  <div className="text-xs mt-1">{feed.last_error}</div>
                </div>
              </div>
            )}
            {feed.last_updated && (
              <div className="text-sm text-muted-foreground">
                Last updated: {new Date(feed.last_updated).toLocaleString()}
              </div>
            )}
            {error && (
              <div className="text-sm text-destructive">{error}</div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <div className="flex gap-2 mr-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">Refresh</span>
              </Button>
              {showDeleteConfirm ? (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="ml-2">Unsubscribe</span>
                </Button>
              )}
            </div>
            <Button type="submit" disabled={isLoading || !title}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
