import { useMemo, useState, useEffect, useCallback } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ExternalLink, Star, Circle, ChevronLeft, ChevronRight, StickyNote, X, Check, FileText, Globe, Maximize2, Minimize2, ArrowLeft, Bot, Play, ListPlus, ChevronDown } from "lucide-react"
import { usePreferences } from "@/contexts/PreferencesContext"
import { useAudioPlayer } from "@/contexts/AudioPlayerContext"
import { useLayout } from "@/contexts/LayoutContext"
import { EnclosurePlayer } from "@/components/EnclosurePlayer"
import { ScoreButtons } from "@/components/ScoreButtons"
import { TagEditor } from "@/components/TagEditor"
import { HighlightedContent } from "@/components/HighlightedContent"
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation"
import type { Entry } from "@/lib/api"

interface EntryContentProps {
  entry: Entry | null
  onToggleRead: () => void
  onToggleStarred: () => void
  onScoreChange?: (score: number) => void
  onPrevious: () => void
  onNext: () => void
  hasPrevious: boolean
  hasNext: boolean
  isLoading: boolean
  scrollViewportRef?: React.RefObject<HTMLDivElement | null>
  onUpdateNote?: (note: string) => Promise<void>
  showIframe: boolean
  onToggleIframe: () => void
  allTags?: string[]
  onAddTag?: (tag: string) => Promise<void>
  onRemoveTag?: (tag: string) => Promise<void>
  focusMode?: boolean
  onToggleFocusMode?: () => void
  // Mobile navigation
  onBack?: () => void
}

function stripImages(html: string): string {
  // Remove img tags from HTML content
  return html.replace(/<img[^>]*>/gi, "")
}

export function EntryContent({
  entry,
  onToggleRead,
  onToggleStarred,
  onScoreChange,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  isLoading,
  scrollViewportRef,
  onUpdateNote,
  showIframe,
  onToggleIframe,
  allTags = [],
  onAddTag,
  onRemoveTag,
  focusMode = false,
  onToggleFocusMode,
  onBack,
}: EntryContentProps) {
  const { preferences } = usePreferences()
  const audioPlayer = useAudioPlayer()
  const layout = useLayout()
  const shouldStripImages = preferences.strip_images === "true"
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [noteText, setNoteText] = useState("")
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [iframeError, setIframeError] = useState(false)

  // Check if TTS is active for this entry
  const isTtsActiveForThisEntry = audioPlayer.source === "tts" && audioPlayer.activeEntryId === entry?.id

  // Swipe navigation for mobile - swipe left/right to navigate articles
  const handleSwipeLeft = useCallback(() => {
    if (hasNext) onNext()
  }, [hasNext, onNext])

  const handleSwipeRight = useCallback(() => {
    if (hasPrevious) onPrevious()
  }, [hasPrevious, onPrevious])

  const swipeRef = useSwipeNavigation<HTMLDivElement>({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    enabled: layout.isMobile && !!entry,
    threshold: 60,
  })

  // Reset state when entry changes
  useEffect(() => {
    setIsEditingNote(false)
    setNoteText(entry?.note || "")
    setIframeError(false)
  }, [entry?.id])

  const handleStartEditNote = () => {
    setNoteText(entry?.note || "")
    setIsEditingNote(true)
  }

  const handleCancelNote = () => {
    setNoteText(entry?.note || "")
    setIsEditingNote(false)
  }

  const handleSaveNote = async () => {
    if (!onUpdateNote) return
    setIsSavingNote(true)
    try {
      await onUpdateNote(noteText)
      setIsEditingNote(false)
    } finally {
      setIsSavingNote(false)
    }
  }

  const processedContent = useMemo(() => {
    if (!entry?.content) return ""
    return shouldStripImages ? stripImages(entry.content) : entry.content
  }, [entry?.content, shouldStripImages])

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    )
  }

  if (!entry) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Select an entry to read
      </div>
    )
  }

  const publishedDate = new Date(entry.published)
  const formattedDate = publishedDate.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <div ref={swipeRef} className="h-full flex flex-col">
      <div className="h-12 px-3 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-1">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to list">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onPrevious} disabled={!hasPrevious} aria-label="Previous entry">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onNext} disabled={!hasNext} aria-label="Next entry">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          {/* Core actions - always visible */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleRead}
            aria-label={entry.unread ? "Mark as read" : "Mark as unread"}
          >
            <Circle
              className="h-4 w-4"
              style={entry.unread ? {
                fill: "var(--color-accent-secondary)",
                color: "var(--color-accent-secondary)",
              } : undefined}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleStarred}
            aria-label={entry.starred ? "Remove star" : "Add star"}
          >
            <Star
              className="h-4 w-4"
              style={entry.starred ? {
                fill: "var(--color-accent-secondary)",
                color: "var(--color-accent-secondary)",
              } : undefined}
            />
          </Button>
          {/* Note button - hidden on small mobile */}
          {onUpdateNote && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleStartEditNote}
              aria-label={entry.note ? "Edit note" : "Add note"}
              className="hidden xs:inline-flex"
            >
              <StickyNote
                className="h-4 w-4"
                style={entry.note ? {
                  color: "var(--color-accent-secondary)",
                } : undefined}
              />
            </Button>
          )}
          {/* Score buttons - hidden on mobile */}
          {onScoreChange && (
            <div className="px-1 hidden sm:block">
              <ScoreButtons
                score={entry.score}
                onScoreChange={onScoreChange}
                size="md"
                keyboardEnabled={true}
              />
            </div>
          )}
          {/* Iframe toggle - hidden on small mobile */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleIframe}
            aria-label={showIframe ? "Show RSS content" : "Show original page"}
            title={showIframe ? "Show RSS content (i)" : "Show original page (i)"}
            className="hidden xs:inline-flex"
          >
            {showIframe ? (
              <FileText className="h-4 w-4" />
            ) : (
              <Globe className="h-4 w-4" />
            )}
          </Button>
          {/* External link - always visible */}
          <Button variant="ghost" size="icon" asChild>
            <a
              href={entry.link}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in new tab"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          {/* Focus mode - hidden on mobile */}
          {onToggleFocusMode && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleFocusMode}
              aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
              title={focusMode ? "Exit focus mode (Shift+F or Escape)" : "Focus mode (Shift+F)"}
              className="hidden sm:inline-flex"
            >
              {focusMode ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {showIframe ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {iframeError ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4 p-6">
              <Globe className="h-12 w-12 opacity-50" />
              <div className="text-center">
                <p className="font-medium">Unable to load original page</p>
                <p className="text-sm mt-1">This site may block embedding. Try opening in a new tab.</p>
              </div>
              <Button variant="outline" asChild>
                <a href={entry.link} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in new tab
                </a>
              </Button>
            </div>
          ) : (
            <iframe
              src={entry.link}
              className="flex-1 w-full border-0"
              title={entry.title}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              onError={() => setIframeError(true)}
            />
          )}
        </div>
      ) : (
      <ScrollArea className="flex-1 min-h-0" viewportRef={scrollViewportRef}>
        {/* Article container - smaller padding on mobile, larger on desktop */}
        <article className="max-w-3xl mx-auto p-4 sm:p-6">
          <header className="mb-4 sm:mb-6">
            {/* Title - larger and more readable on all screens */}
            <h1 className="text-xl sm:text-2xl font-bold mb-2 leading-tight">
              <a
                href={entry.link}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                {entry.title}
              </a>
            </h1>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-sm text-muted-foreground">
              {entry.feed_title && <span>{entry.feed_title}</span>}
              {entry.author && (
                <>
                  <span>·</span>
                  <span>{entry.author}</span>
                </>
              )}
              <span>·</span>
              <time dateTime={entry.published}>{formattedDate}</time>
            </div>
            {entry.tags && entry.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {entry.tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    style={{
                      backgroundColor: tag.bg_color,
                      color: tag.fg_color,
                    }}
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}
            {onAddTag && onRemoveTag && (
              <div className="mt-2">
                <TagEditor
                  tags={(entry.tags || []).map(t => t.name)}
                  allTags={allTags}
                  onAddTag={onAddTag}
                  onRemoveTag={onRemoveTag}
                />
              </div>
            )}
            {/* TTS Listen Button - dropdown with play now / add to queue */}
            {!isTtsActiveForThisEntry && (
              <div className="mt-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Bot className="h-4 w-4" />
                      Listen
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      onClick={() => audioPlayer.playNow({
                        entryId: entry.id,
                        entryTitle: entry.title,
                        feedTitle: entry.feed_title || undefined,
                        source: "tts",
                      })}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Play now
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => audioPlayer.addToQueue({
                        entryId: entry.id,
                        entryTitle: entry.title,
                        feedTitle: entry.feed_title || undefined,
                        source: "tts",
                      })}
                    >
                      <ListPlus className="h-4 w-4 mr-2" />
                      Add to queue
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </header>

          {entry.enclosures && entry.enclosures.length > 0 && (
            <EnclosurePlayer
              enclosures={entry.enclosures}
              entryId={entry.id}
              entryTitle={entry.title}
              feedTitle={entry.feed_title}
            />
          )}

          {isTtsActiveForThisEntry && audioPlayer.timestamps.length > 0 ? (
            <HighlightedContent
              html={processedContent}
              timestamps={audioPlayer.timestamps}
              currentWordIndex={audioPlayer.currentWordIndex}
              isPlaying={audioPlayer.state === "playing"}
              autoScroll={audioPlayer.autoScroll}
              onUserScroll={audioPlayer.pauseAutoScroll}
              className="prose prose-sm max-w-none
                [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3
                [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-2
                [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2
                [&_p]:my-3 [&_p]:leading-relaxed
                [&_ul]:my-3 [&_ul]:pl-6 [&_ul]:list-disc
                [&_ol]:my-3 [&_ol]:pl-6 [&_ol]:list-decimal
                [&_li]:my-1
                [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4
                [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-4
                [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-sm
                [&_a]:text-primary [&_a]:underline
                [&_img]:block [&_img]:max-w-full [&_img]:h-auto [&_img]:my-4 [&_img]:rounded"
            />
          ) : (
            <div
              className="prose prose-sm max-w-none
                [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3
                [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-2
                [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2
                [&_p]:my-3 [&_p]:leading-relaxed
                [&_ul]:my-3 [&_ul]:pl-6 [&_ul]:list-disc
                [&_ol]:my-3 [&_ol]:pl-6 [&_ol]:list-decimal
                [&_li]:my-1
                [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4
                [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-4
                [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-sm
                [&_a]:text-primary [&_a]:underline
                [&_img]:block [&_img]:max-w-full [&_img]:h-auto [&_img]:my-4 [&_img]:rounded"
              dangerouslySetInnerHTML={{ __html: processedContent }}
            />
          )}

          {(entry.note || isEditingNote) && (
            <div className="mt-6 p-4 bg-muted rounded-md">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium flex items-center gap-1">
                  <StickyNote className="h-4 w-4" />
                  Note
                </div>
                {!isEditingNote && onUpdateNote && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleStartEditNote}
                    className="h-6 text-xs"
                  >
                    Edit
                  </Button>
                )}
              </div>
              {isEditingNote ? (
                <div className="space-y-2">
                  <Textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault()
                        handleSaveNote()
                      }
                    }}
                    placeholder="Add a note about this article..."
                    className="min-h-[100px]"
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelNote}
                      disabled={isSavingNote}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleSaveNote}
                      disabled={isSavingNote}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      {isSavingNote ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-sm whitespace-pre-wrap">{entry.note}</div>
              )}
            </div>
          )}
        </article>
      </ScrollArea>
      )}
    </div>
  )
}
