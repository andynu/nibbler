import { useEffect, useMemo, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, CircleDashed, CircleCheck, ChevronRight, RefreshCw } from "lucide-react"
import { api, Story } from "@/lib/api"
import type { StoryAnalysis, StoryArticle, StoryDetail as StoryDetailType } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useDateFormat } from "@/hooks/useDateFormat"

interface StoriesPanelProps {
  selectedStoryId: number | null
  onSelectStory: (storyId: number) => void
  /**
   * Incrementing tick causes the list to reload. Parent bumps this after
   * creating a new story so the index stays in sync.
   */
  reloadKey?: number
}

/**
 * Story index view. Shows the authenticated user's stories grouped by
 * status: active stories up top (with latest timeline label + updated_at)
 * and concluded stories collapsed into a separate section below.
 */
export function StoriesPanel({ selectedStoryId, onSelectStory, reloadKey = 0 }: StoriesPanelProps) {
  const [stories, setStories] = useState<Story[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showConcluded, setShowConcluded] = useState(false)
  const { formatListDate } = useDateFormat()

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    api.stories
      .list()
      .then((result) => {
        if (cancelled) return
        setStories(result)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message || "Failed to load stories")
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const active = stories.filter((s) => s.status === "active")
  const concluded = stories.filter((s) => s.status === "concluded")

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading stories...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive-text">
        {error}
      </div>
    )
  }

  if (stories.length === 0) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No stories yet. Open an article and choose <strong>Follow this story</strong> to start tracking.
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">Stories</h2>
        <p className="text-xs text-muted-foreground">
          {active.length} active{concluded.length > 0 ? `, ${concluded.length} concluded` : ""}
        </p>
      </div>
      <ScrollArea className="flex-1">
        <ul role="list" className="divide-y divide-border">
          {active.map((story) => (
            <StoryRow
              key={story.id}
              story={story}
              isSelected={story.id === selectedStoryId}
              onClick={() => onSelectStory(story.id)}
              formatDate={formatListDate}
            />
          ))}
        </ul>

        {concluded.length > 0 && (
          <div className="border-t border-border">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50"
              onClick={() => setShowConcluded((v) => !v)}
              aria-expanded={showConcluded}
            >
              <span>Concluded ({concluded.length})</span>
              <ChevronRight
                className={cn(
                  "h-3 w-3 transition-transform",
                  showConcluded && "rotate-90"
                )}
              />
            </button>
            {showConcluded && (
              <ul role="list" className="divide-y divide-border">
                {concluded.map((story) => (
                  <StoryRow
                    key={story.id}
                    story={story}
                    isSelected={story.id === selectedStoryId}
                    onClick={() => onSelectStory(story.id)}
                    formatDate={formatListDate}
                    muted
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

interface StoryRowProps {
  story: Story
  isSelected: boolean
  onClick: () => void
  formatDate: (d: string) => string
  muted?: boolean
}

function StoryRow({ story, isSelected, onClick, formatDate, muted }: StoryRowProps) {
  const label = story.latest_analysis?.timeline_label
  const updated = story.updated_at ?? story.created_at
  const Icon = story.status === "concluded" ? CircleCheck : CircleDashed

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={isSelected ? "true" : undefined}
        className={cn(
          "w-full text-left px-4 py-3 flex flex-col gap-1 hover:bg-muted/50 focus:outline-none focus:bg-muted/60",
          isSelected && "bg-muted",
          muted && "opacity-70"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          <span className="font-medium truncate">{story.name}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {label && (
            <Badge
              variant={story.latest_analysis?.new_development ? "default" : "secondary"}
              className="text-[10px] h-4 px-1.5"
            >
              {label.replace(/_/g, " ")}
            </Badge>
          )}
          <span>{formatDate(updated)}</span>
        </div>
      </button>
    </li>
  )
}

// ---------------- Detail view ----------------

interface StoryDetailProps {
  storyId: number
  onClose?: () => void
  onDeleted?: (storyId: number) => void
  reloadKey?: number
}

/**
 * Story detail view. Renders the story's current summary, a timeline from
 * its analyses (labels shown only for entries with new_development=true),
 * and the articles grouped by the analysis batch that first referenced them.
 */
export function StoryDetail({ storyId, onClose, onDeleted, reloadKey = 0 }: StoryDetailProps) {
  const [detail, setDetail] = useState<StoryDetailType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { formatReaderDate, formatListDate } = useDateFormat()

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    api.stories
      .get(storyId)
      .then((result) => {
        if (cancelled) return
        setDetail(result)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message || "Failed to load story")
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [storyId, reloadKey])

  // Group articles by the first analysis batch that referenced them.
  // Articles not referenced by any analysis go into an "Unassigned" bucket.
  const groupedArticles = useMemo(() => {
    if (!detail) return [] as Array<{ analysis: StoryAnalysis | null; articles: StoryArticle[] }>
    const assigned = new Set<number>()
    const byAnalysis: Array<{ analysis: StoryAnalysis | null; articles: StoryArticle[] }> = []
    const articlesById = new Map<number, StoryArticle>(
      detail.articles.map((a) => [a.id, a])
    )
    // Iterate analyses newest-first for grouping display.
    const analysesDesc = [...detail.analyses].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    for (const a of analysesDesc) {
      const articles: StoryArticle[] = []
      for (const id of a.article_ids) {
        if (assigned.has(id)) continue
        const article = articlesById.get(id)
        if (article) {
          assigned.add(id)
          articles.push(article)
        }
      }
      if (articles.length > 0) byAnalysis.push({ analysis: a, articles })
    }
    const unassigned = detail.articles.filter((a) => !assigned.has(a.id))
    if (unassigned.length > 0) byAnalysis.push({ analysis: null, articles: unassigned })
    return byAnalysis
  }, [detail])

  const handleDelete = async () => {
    if (!detail) return
    if (!confirm(`Delete the story "${detail.name}"? This cannot be undone.`)) return
    try {
      await api.stories.delete(detail.id)
      onDeleted?.(detail.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete story")
    }
  }

  const handleConclude = async () => {
    if (!detail) return
    try {
      const updated = await api.stories.update(detail.id, {
        story: { status: "concluded" },
      })
      setDetail({ ...detail, ...updated })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update story")
    }
  }

  const [isGeneratingWrapup, setIsGeneratingWrapup] = useState(false)
  const [wrapupError, setWrapupError] = useState<string | null>(null)

  const [fetchState, setFetchState] = useState<"idle" | "queueing" | "queued" | "reloading">("idle")
  const [fetchError, setFetchError] = useState<string | null>(null)

  const handleFetchNow = async () => {
    if (!detail) return
    setFetchError(null)
    setFetchState("queueing")
    try {
      await api.stories.fetch(detail.id)
      setFetchState("queued")
      // Give the job a chance to run, then reload the detail so new articles
      // appear without a manual refresh. The job sleeps 1.5s between queries,
      // so ~6s covers typical 1-3 query stories; longer ones may need another
      // click or the user can wait for the next reload on navigation.
      setTimeout(async () => {
        setFetchState("reloading")
        try {
          const refreshed = await api.stories.get(detail.id)
          setDetail(refreshed)
        } catch {
          // Ignore reload errors — the job may still be running.
        } finally {
          setFetchState("idle")
        }
      }, 6000)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to queue fetch")
      setFetchState("idle")
    }
  }

  const handleGenerateWrapup = async () => {
    if (!detail) return
    setIsGeneratingWrapup(true)
    setWrapupError(null)
    try {
      const result = await api.stories.generateWrapup(detail.id)
      setDetail({
        ...detail,
        wrapup: result.wrapup,
        wrapup_generated_at: result.wrapup_generated_at,
      })
    } catch (err) {
      setWrapupError(err instanceof Error ? err.message : "Failed to generate wrapup")
    } finally {
      setIsGeneratingWrapup(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading story...
      </div>
    )
  }

  if (error) {
    return <div className="p-4 text-sm text-destructive-text">{error}</div>
  }

  if (!detail) {
    return <div className="p-4 text-sm text-muted-foreground">Story not found.</div>
  }

  return (
    <ScrollArea className="h-full">
      <article className="p-6 max-w-3xl mx-auto space-y-6">
        <header className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-semibold">{detail.name}</h1>
            <div className="flex gap-2">
              {detail.status === "active" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFetchNow}
                    disabled={fetchState !== "idle"}
                    title="Queue a fresh Google News RSS fetch for this story's queries"
                  >
                    {fetchState === "queueing" ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Queueing...
                      </>
                    ) : fetchState === "queued" ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Fetching...
                      </>
                    ) : fetchState === "reloading" ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Reloading...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Fetch now
                      </>
                    )}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleConclude}>
                    Mark concluded
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateWrapup}
                disabled={isGeneratingWrapup}
              >
                {isGeneratingWrapup ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Generating...
                  </>
                ) : detail.wrapup ? (
                  "Regenerate wrapup"
                ) : (
                  "Generate wrapup"
                )}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDelete}>
                Delete
              </Button>
              {onClose && (
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Close
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={detail.status === "concluded" ? "secondary" : "default"}>
              {detail.status}
            </Badge>
            <span>Created {formatReaderDate(detail.created_at)}</span>
            {detail.concluded_at && (
              <span>Concluded {formatReaderDate(detail.concluded_at)}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {detail.queries.map((q) => (
              <Badge key={q} variant="outline" className="text-xs font-normal">
                {q}
              </Badge>
            ))}
          </div>
        </header>

        {wrapupError && (
          <div className="p-3 text-sm text-destructive-text border border-destructive/30 rounded-md">
            {wrapupError}
          </div>
        )}

        {fetchError && (
          <div className="p-3 text-sm text-destructive-text border border-destructive/30 rounded-md">
            {fetchError}
          </div>
        )}

        {detail.wrapup && (
          <section>
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-sm font-semibold uppercase text-muted-foreground">
                Wrapup
              </h2>
              {detail.wrapup_generated_at && (
                <span className="text-xs text-muted-foreground">
                  Generated {formatReaderDate(detail.wrapup_generated_at)}
                </span>
              )}
            </div>
            <div className="text-sm whitespace-pre-wrap border rounded-md p-3 bg-muted/30">
              {detail.wrapup}
            </div>
          </section>
        )}

        {detail.summary && (
          <section>
            <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-1">
              Current summary
            </h2>
            <p className="text-sm whitespace-pre-wrap">{detail.summary}</p>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-2">
            Timeline
          </h2>
          {detail.analyses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No analyses yet. The overnight batch will produce the first entry once articles arrive.
            </p>
          ) : (
            <ol className="space-y-3 border-l-2 border-border pl-4">
              {[...detail.analyses]
                .sort(
                  (a, b) =>
                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                )
                .map((a) => (
                  <li key={a.id} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[1.35rem] top-1.5 h-3 w-3 rounded-full border-2 border-background",
                        a.new_development ? "bg-primary" : "bg-muted-foreground/40"
                      )}
                      aria-hidden="true"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      {a.new_development && a.timeline_label && (
                        <Badge variant="default" className="text-[10px]">
                          {a.timeline_label.replace(/_/g, " ")}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatReaderDate(a.created_at)}
                      </span>
                    </div>
                    {a.summary && (
                      <p className="text-sm mt-1 whitespace-pre-wrap">{a.summary}</p>
                    )}
                  </li>
                ))}
            </ol>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-2">
            Articles ({detail.articles.length})
          </h2>
          {groupedArticles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No articles collected yet.
            </p>
          ) : (
            <div className="space-y-4">
              {groupedArticles.map((group, idx) => (
                <div key={group.analysis?.id ?? `unassigned-${idx}`}>
                  <h3 className="text-xs font-medium text-muted-foreground mb-1">
                    {group.analysis ? (
                      <>
                        Batch from {formatListDate(group.analysis.created_at)}
                        {group.analysis.new_development && group.analysis.timeline_label && (
                          <>
                            {" "}
                            &middot; {group.analysis.timeline_label.replace(/_/g, " ")}
                          </>
                        )}
                      </>
                    ) : (
                      "Unassigned"
                    )}
                  </h3>
                  <ul className="space-y-2">
                    {group.articles.map((article) => (
                      <li key={article.id} className="text-sm">
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline"
                        >
                          {article.title || article.url}
                        </a>
                        <div className="text-xs text-muted-foreground">
                          {article.source && <span>{article.source}</span>}
                          {article.source && article.published_at && " · "}
                          {article.published_at && (
                            <span>{formatListDate(article.published_at)}</span>
                          )}
                        </div>
                        {article.snippet && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {article.snippet}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </article>
    </ScrollArea>
  )
}
