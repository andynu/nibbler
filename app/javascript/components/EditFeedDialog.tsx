import { useState, useEffect, useCallback, useMemo } from "react"
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { CategorySelector } from "@/components/CategorySelector"
import { api, Feed, FeedInfo, Category, Filter } from "@/lib/api"
import { usePreferences } from "@/contexts/PreferencesContext"
import { cn } from "@/lib/utils"
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Rss,
  ExternalLink,
  Clock,
  Calendar,
  BarChart3,
  Tags,
  Sparkles,
} from "lucide-react"

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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function formatDuration(seconds: number | null): string {
  if (!seconds) return "Unknown"
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "Never"
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function FrequencyChart({ data, labels }: { data: Record<number, number>; labels: string[] }) {
  const max = Math.max(...Object.values(data), 1)

  return (
    <div className="flex items-end gap-0.5 h-12">
      {labels.map((label, i) => {
        const value = data[i] || 0
        const height = max > 0 ? (value / max) * 100 : 0
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center gap-0.5"
            title={`${label}: ${value} posts`}
          >
            <div
              className="w-full bg-primary/60 rounded-t transition-all"
              style={{ height: `${height}%`, minHeight: value > 0 ? "2px" : 0 }}
            />
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

// Helper to determine if a filter is a "word tagging filter" for a given word.
function isWordTaggingFilter(filter: Filter, word: string): boolean {
  if (filter.rules.length !== 1 || filter.actions.length !== 1) return false

  const rule = filter.rules[0]
  const action = filter.actions[0]

  const expectedPattern = `\\b${word}\\b`
  if (rule.filter_type !== 3) return false
  if (rule.reg_exp.toLowerCase() !== expectedPattern.toLowerCase()) return false

  if (action.action_type !== 4) return false
  if (action.action_param?.toLowerCase() !== word.toLowerCase()) return false

  return true
}

function findWordFilter(filters: Filter[], word: string): number | null {
  const filter = filters.find((f) => isWordTaggingFilter(f, word))
  return filter?.id ?? null
}

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

  // Edit form state
  const [title, setTitle] = useState("")
  const [feedUrl, setFeedUrl] = useState("")
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [updateInterval, setUpdateInterval] = useState<string>("0")
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Info state
  const [info, setInfo] = useState<FeedInfo | null>(null)
  const [isInfoLoading, setIsInfoLoading] = useState(false)
  const [filters, setFilters] = useState<Filter[]>([])
  const [pendingWord, setPendingWord] = useState<string | null>(null)

  // Flatten categories for matching
  const flatCategories = useMemo(() => {
    const result: { id: number; title: string }[] = []
    const flatten = (cats: Category[]) => {
      for (const cat of cats) {
        result.push({ id: cat.id, title: cat.title })
        if (cat.children) flatten(cat.children)
      }
    }
    flatten(categories)
    return result
  }, [categories])

  // Compute category suggestions based on word frequency
  const categorySuggestions = useMemo(() => {
    if (!info?.top_words || categoryId !== null) return []

    const suggestions: { category: { id: number; title: string }; matchingWords: string[] }[] = []

    for (const cat of flatCategories) {
      const catWords = cat.title.toLowerCase().split(/\s+/)
      const matchingWords = info.top_words
        .filter(({ word }) => catWords.some((cw) => cw.includes(word.toLowerCase()) || word.toLowerCase().includes(cw)))
        .map(({ word }) => word)

      if (matchingWords.length > 0) {
        suggestions.push({ category: cat, matchingWords })
      }
    }

    // Sort by number of matching words (descending)
    return suggestions.sort((a, b) => b.matchingWords.length - a.matchingWords.length).slice(0, 3)
  }, [info?.top_words, categoryId, flatCategories])

  // Initialize form state when feed changes
  useEffect(() => {
    if (feed) {
      setTitle(feed.title)
      setFeedUrl(feed.feed_url)
      setCategoryId(feed.category_id ?? null)
      setUpdateInterval(String(feed.update_interval ?? 0))
      setError(null)
      setShowDeleteConfirm(false)
      setIsDeleting(false)
    }
  }, [feed])

  // Load feed info when dialog opens
  useEffect(() => {
    if (open && feed) {
      setIsInfoLoading(true)
      Promise.all([api.feeds.info(feed.id), api.filters.list()])
        .then(([feedInfo, filterList]) => {
          setInfo(feedInfo)
          setFilters(filterList)
        })
        .catch((err) => console.error("Failed to load feed info:", err))
        .finally(() => setIsInfoLoading(false))
    } else {
      setInfo(null)
      setFilters([])
    }
  }, [open, feed?.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!feed) return

    setError(null)
    setIsLoading(true)

    try {
      const updatedFeed = await api.feeds.update(feed.id, {
        feed: {
          title,
          feed_url: feedUrl,
          category_id: categoryId,
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

  const handleWordClick = useCallback(
    async (word: string) => {
      if (!feed) return

      setPendingWord(word)
      try {
        const existingFilterId = findWordFilter(filters, word)

        if (existingFilterId) {
          await api.filters.delete(existingFilterId)
          setFilters((prev) => prev.filter((f) => f.id !== existingFilterId))
        } else {
          const newFilter = await api.filters.create({
            filter: {
              title: `Tag: ${word}`,
              enabled: true,
              match_any_rule: false,
              inverse: false,
              filter_rules_attributes: [
                {
                  filter_type: 3,
                  reg_exp: `\\b${word}\\b`,
                  inverse: false,
                },
              ],
              filter_actions_attributes: [
                {
                  action_type: 4,
                  action_param: word,
                },
              ],
            },
          })
          setFilters((prev) => [...prev, newFilter])
        }
      } catch (err) {
        console.error("Failed to toggle word filter:", err)
      } finally {
        setPendingWord(null)
      }
    },
    [feed, filters]
  )

  if (!feed) return null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {feed.icon_url ? (
                <img src={feed.icon_url} className="h-5 w-5" alt="" />
              ) : (
                <Rss className="h-5 w-5 text-muted-foreground" />
              )}
              Edit Feed
            </DialogTitle>
            <DialogDescription>
              Update feed settings and view statistics.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left column: Edit form */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(title + " rss")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Search for RSS feed
                  </a>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="feedUrl">Feed URL</Label>
                  <Input
                    id="feedUrl"
                    type="url"
                    value={feedUrl}
                    onChange={(e) => setFeedUrl(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <CategorySelector
                    categories={categories}
                    selectedCategoryId={categoryId}
                    onSelect={setCategoryId}
                    placeholder="No category"
                  />

                  {/* Category suggestions based on word frequency */}
                  {categorySuggestions.length > 0 && (
                    <div className="space-y-1.5 mt-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Sparkles className="h-3 w-3" />
                        Suggested based on content:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {categorySuggestions.map(({ category, matchingWords }) => (
                          <button
                            key={category.id}
                            type="button"
                            onClick={() => setCategoryId(category.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted hover:bg-muted/80 rounded text-xs transition-colors"
                            title={`Matches: ${matchingWords.join(", ")}`}
                          >
                            {category.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
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

                {error && (
                  <div className="text-sm text-destructive">{error}</div>
                )}
              </div>

              {/* Right column: Feed info */}
              <div className="space-y-4 border-t md:border-t-0 md:border-l md:pl-6 pt-4 md:pt-0">
                {isInfoLoading ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading...
                  </div>
                ) : info ? (
                  <>
                    {/* Feed URLs */}
                    <section>
                      <h3 className="text-sm font-medium mb-2">Feed Details</h3>
                      <dl className="text-sm space-y-1">
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground w-20 shrink-0">Feed URL</dt>
                          <dd className="truncate flex-1">
                            <a
                              href={info.feed_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              <span className="truncate">{info.feed_url}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          </dd>
                        </div>
                        {info.site_url && (
                          <div className="flex gap-2">
                            <dt className="text-muted-foreground w-20 shrink-0">Site</dt>
                            <dd className="truncate flex-1">
                              <a
                                href={info.site_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline inline-flex items-center gap-1"
                              >
                                <span className="truncate">{info.site_url}</span>
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </a>
                            </dd>
                          </div>
                        )}
                      </dl>
                    </section>

                    {/* Sync Status */}
                    <section>
                      <h3 className="text-sm font-medium mb-2 flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        Sync Status
                      </h3>
                      <dl className="text-sm space-y-1">
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground w-20 shrink-0">Last sync</dt>
                          <dd>{formatRelativeTime(info.last_updated)}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground w-20 shrink-0">Interval</dt>
                          <dd>
                            {info.update_interval
                              ? formatDuration(info.update_interval * 60)
                              : info.calculated_interval_seconds
                                ? `Auto (${formatDuration(info.calculated_interval_seconds)})`
                                : "Default"}
                          </dd>
                        </div>
                      </dl>
                    </section>

                    {/* Entry Stats */}
                    <section>
                      <h3 className="text-sm font-medium mb-2 flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        Content
                      </h3>
                      <dl className="text-sm space-y-1">
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground w-20 shrink-0">Entries</dt>
                          <dd>{info.entry_count.toLocaleString()}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground w-20 shrink-0">Range</dt>
                          <dd>
                            {info.oldest_entry_date && info.newest_entry_date
                              ? `${new Date(info.oldest_entry_date).getFullYear()} — ${new Date(info.newest_entry_date).getFullYear()}`
                              : "N/A"}
                          </dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground w-20 shrink-0">Frequency</dt>
                          <dd>
                            {info.posts_per_day > 0
                              ? info.posts_per_day >= 1
                                ? `~${info.posts_per_day.toFixed(1)} posts/day`
                                : `~${(info.posts_per_day * 7).toFixed(1)} posts/week`
                              : "No recent posts"}
                          </dd>
                        </div>
                      </dl>
                    </section>

                    {/* Posting Patterns */}
                    {info.entry_count > 0 && (
                      <section>
                        <h3 className="text-sm font-medium mb-2 flex items-center gap-1">
                          <BarChart3 className="h-4 w-4" />
                          Posting Patterns
                        </h3>
                        <div className="text-xs text-muted-foreground mb-1">Last 90 days by day</div>
                        <FrequencyChart data={info.frequency_by_day} labels={DAY_NAMES} />
                      </section>
                    )}

                    {/* Word Frequency */}
                    {info.top_words && info.top_words.length > 0 && (
                      <section>
                        <h3 className="text-sm font-medium mb-2 flex items-center gap-1">
                          <Tags className="h-4 w-4" />
                          Common Topics
                        </h3>
                        <p className="text-xs text-muted-foreground mb-2">
                          Click a word to create a tagging filter
                        </p>
                        <TooltipProvider>
                          <div className="flex flex-wrap gap-1.5">
                            {info.top_words.map(({ word, count }) => {
                              const hasFilter = findWordFilter(filters, word) !== null
                              const isPending = pendingWord === word

                              return (
                                <Tooltip key={word}>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => handleWordClick(word)}
                                      disabled={isPending}
                                      className={cn(
                                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors cursor-pointer",
                                        "hover:ring-2 hover:ring-primary/50 focus:outline-none focus:ring-2 focus:ring-primary",
                                        hasFilter
                                          ? "bg-primary text-primary-foreground font-medium"
                                          : "bg-muted hover:bg-muted/80",
                                        isPending && "opacity-50 cursor-wait"
                                      )}
                                    >
                                      <span>{word}</span>
                                      <span
                                        className={cn(
                                          hasFilter ? "text-primary-foreground/70" : "text-muted-foreground"
                                        )}
                                      >
                                        {count}
                                      </span>
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {hasFilter
                                      ? `Click to remove filter for "${word}"`
                                      : `Click to create filter tagging articles with "${word}"`}
                                  </TooltipContent>
                                </Tooltip>
                              )
                            })}
                          </div>
                        </TooltipProvider>
                      </section>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t">
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
            <Button type="submit" disabled={isLoading || !title || !feedUrl}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
