import { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Rss, ExternalLink, Calendar, Clock, AlertCircle, BarChart3, Tags } from "lucide-react"
import { api } from "@/lib/api"
import type { Feed, FeedInfo, Filter } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface FeedInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  feed: Feed | null
}

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
// These are filters created by clicking a word in the frequency list.
// They have:
// - A single rule matching "Title or Content" (type 3) with the word pattern
// - A single action of type "tag" (4) with the word as the tag name
function isWordTaggingFilter(filter: Filter, word: string): boolean {
  if (filter.rules.length !== 1 || filter.actions.length !== 1) return false

  const rule = filter.rules[0]
  const action = filter.actions[0]

  // Rule must be "Title or Content" (type 3) matching the word (case-insensitive)
  // Using word boundary pattern: \bword\b
  const expectedPattern = `\\b${word}\\b`
  if (rule.filter_type !== 3) return false
  if (rule.reg_exp.toLowerCase() !== expectedPattern.toLowerCase()) return false

  // Action must be "tag" (type 4) with the word as the tag name
  if (action.action_type !== 4) return false
  if (action.action_param?.toLowerCase() !== word.toLowerCase()) return false

  return true
}

// Find filter ID for a given word if a word tagging filter exists
function findWordFilter(filters: Filter[], word: string): number | null {
  const filter = filters.find((f) => isWordTaggingFilter(f, word))
  return filter?.id ?? null
}

export function FeedInfoDialog({ open, onOpenChange, feed }: FeedInfoDialogProps) {
  const [info, setInfo] = useState<FeedInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filter[]>([])
  const [pendingWord, setPendingWord] = useState<string | null>(null)

  // Load feed info and filters when dialog opens
  useEffect(() => {
    if (open && feed) {
      setIsLoading(true)
      setError(null)
      Promise.all([api.feeds.info(feed.id), api.filters.list()])
        .then(([feedInfo, filterList]) => {
          setInfo(feedInfo)
          setFilters(filterList)
        })
        .catch((err) => setError(err.message))
        .finally(() => setIsLoading(false))
    } else {
      setInfo(null)
      setFilters([])
    }
  }, [open, feed?.id])

  // Handle clicking a word to create or remove a filter
  const handleWordClick = useCallback(
    async (word: string) => {
      if (!feed) return

      setPendingWord(word)
      try {
        const existingFilterId = findWordFilter(filters, word)

        if (existingFilterId) {
          // Remove the filter (existing tags remain on articles)
          await api.filters.delete(existingFilterId)
          setFilters((prev) => prev.filter((f) => f.id !== existingFilterId))
        } else {
          // Create a new tagging filter for this word
          const newFilter = await api.filters.create({
            filter: {
              title: `Tag: ${word}`,
              enabled: true,
              match_any_rule: false,
              inverse: false,
              filter_rules_attributes: [
                {
                  filter_type: 3, // Title or Content
                  reg_exp: `\\b${word}\\b`,
                  inverse: false,
                },
              ],
              filter_actions_attributes: [
                {
                  action_type: 4, // Tag
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {feed.icon_url ? (
              <img src={feed.icon_url} className="h-5 w-5" alt="" />
            ) : (
              <Rss className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="truncate">{feed.title}</span>
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        )}

        {error && (
          <div className="py-8 text-center text-destructive">
            <AlertCircle className="h-6 w-6 mx-auto mb-2" />
            {error}
          </div>
        )}

        {info && !isLoading && (
          <div className="space-y-4">
            {/* Basic Info */}
            <section>
              <h3 className="text-sm font-medium mb-2">Feed Details</h3>
              <dl className="text-sm space-y-1">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground w-24 shrink-0">Feed URL</dt>
                  <dd className="truncate flex-1">
                    <a
                      href={info.feed_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {info.feed_url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </dd>
                </div>
                {info.site_url && (
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground w-24 shrink-0">Site URL</dt>
                    <dd className="truncate flex-1">
                      <a
                        href={info.site_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {info.site_url}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </dd>
                  </div>
                )}
                {info.category_title && (
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground w-24 shrink-0">Category</dt>
                    <dd>{info.category_title}</dd>
                  </div>
                )}
              </dl>
            </section>

            {/* Sync Info */}
            <section>
              <h3 className="text-sm font-medium mb-2 flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Sync Status
              </h3>
              <dl className="text-sm space-y-1">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground w-24 shrink-0">Last sync</dt>
                  <dd>{formatRelativeTime(info.last_updated)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground w-24 shrink-0">Next sync</dt>
                  <dd>
                    {info.next_poll_at
                      ? new Date(info.next_poll_at) < new Date()
                        ? "Pending"
                        : formatRelativeTime(info.next_poll_at).replace(" ago", "")
                      : "Unknown"}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground w-24 shrink-0">Interval</dt>
                  <dd>
                    {info.update_interval
                      ? formatDuration(info.update_interval * 60)
                      : info.calculated_interval_seconds
                        ? `Auto (${formatDuration(info.calculated_interval_seconds)})`
                        : "Default"}
                  </dd>
                </div>
                {info.etag && (
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground w-24 shrink-0">ETag</dt>
                    <dd className="font-mono text-xs truncate">{info.etag}</dd>
                  </div>
                )}
                {info.last_modified && (
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground w-24 shrink-0">Last-Modified</dt>
                    <dd className="text-xs">{info.last_modified}</dd>
                  </div>
                )}
                {info.last_error && (
                  <div className="flex gap-2 text-destructive">
                    <dt className="w-24 shrink-0">Last error</dt>
                    <dd className="truncate">{info.last_error}</dd>
                  </div>
                )}
              </dl>
            </section>

            {/* Entry Stats */}
            <section>
              <h3 className="text-sm font-medium mb-2 flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Content Stats
              </h3>
              <dl className="text-sm space-y-1">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground w-24 shrink-0">Total entries</dt>
                  <dd>{info.entry_count.toLocaleString()}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground w-24 shrink-0">Oldest entry</dt>
                  <dd>
                    {info.oldest_entry_date
                      ? new Date(info.oldest_entry_date).toLocaleDateString()
                      : "None"}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground w-24 shrink-0">Newest entry</dt>
                  <dd>{formatRelativeTime(info.newest_entry_date)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground w-24 shrink-0">Frequency</dt>
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

            {/* Frequency Charts */}
            {info.entry_count > 0 && (
              <section>
                <h3 className="text-sm font-medium mb-2 flex items-center gap-1">
                  <BarChart3 className="h-4 w-4" />
                  Posting Patterns (last 90 days)
                </h3>
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">By day of week</div>
                    <FrequencyChart data={info.frequency_by_day} labels={DAY_NAMES} />
                  </div>
                </div>
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
