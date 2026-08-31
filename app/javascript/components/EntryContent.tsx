import { useMemo, useState, useEffect, useCallback } from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"
import { ScrollBar } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ExternalLink, Star, Circle, ChevronLeft, ChevronRight, StickyNote, X, Check, FileText, Globe, Maximize2, Minimize2, ArrowLeft, Play, ListPlus, Rss, Bookmark, Keyboard, Sparkles, Loader2, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePreferences } from "@/contexts/PreferencesContext"
import { useAudioPlayer } from "@/contexts/AudioPlayerContext"
import { useLayout } from "@/contexts/LayoutContext"
import { EnclosurePlayer } from "@/components/EnclosurePlayer"
import { ScoreButtons } from "@/components/ScoreButtons"
import { EntryActionsMenu } from "@/components/EntryActionsMenu"
import { SuggestedTags } from "@/components/SuggestedTags"
import { FollowStoryDialog } from "@/components/FollowStoryDialog"
import { HighlightedContent } from "@/components/HighlightedContent"
import { EntrySummaryCallout } from "@/components/EntrySummaryCallout"
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation"
import { useIframeFocusGuard } from "@/hooks/useIframeFocusGuard"
import { useEmbedPolicy } from "@/hooks/useEmbedPolicy"
import { useEntrySummary } from "@/hooks/useEntrySummary"
import type { CopyLinkStatus } from "@/hooks/useCopyLink"
import type { Entry, Story } from "@/lib/api"

interface EntryContentProps {
  entry: Entry | null
  onToggleRead: () => void
  onToggleStarred: () => void
  onTogglePublished?: () => void
  onScoreChange?: (score: number) => void
  onPrevious: () => void
  onNext: () => void
  hasPrevious: boolean
  hasNext: boolean
  /**
   * Title of the entry `onNext` would open, for the end-of-article button.
   * "What is next" is the question a reader has at the end of the text, and the
   * answer is already in the loaded list. Optional: when hasNext is true but no
   * title came down, the button falls back to naming the action alone.
   */
  nextEntryTitle?: string
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
  /**
   * Puts entry.link on the clipboard. The `c` shortcut and the overflow menu's
   * copy row both run this one handler, so the clipboard call and its outcome
   * live in a single place (application.tsx, useCopyLink).
   */
  onCopyLink?: () => void
  /** Drives the header's transient copy indicator; see useCopyLink. */
  copyLinkStatus?: CopyLinkStatus
  // Focus mode collapses the sidebar and the list to 0px, so this header is the
  // only Nibbler chrome left. These carry the orientation the list normally
  // provides: which list is being walked, and how far into it we are.
  listTitle?: string
  entryIndex?: number
  entryCount?: number
  // Mobile navigation
  onBack?: () => void
  // Called when a story is created from the "Follow this story" flow.
  // Parent should navigate to the stories view with this story selected.
  onFollowStoryCreated?: (story: Story) => void
}

function stripImages(html: string): string {
  // Remove img tags from HTML content
  return html.replace(/<img[^>]*>/gi, "")
}

export function EntryContent({
  entry,
  onToggleRead,
  onToggleStarred,
  onTogglePublished,
  onScoreChange,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  nextEntryTitle,
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
  onCopyLink,
  copyLinkStatus = "idle",
  listTitle,
  entryIndex = -1,
  entryCount = 0,
  onBack,
  onFollowStoryCreated,
}: EntryContentProps) {
  const { preferences } = usePreferences()
  const audioPlayer = useAudioPlayer()
  const layout = useLayout()
  const shouldStripImages = preferences.strip_images === "true"
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [noteText, setNoteText] = useState("")
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [followStoryOpen, setFollowStoryOpen] = useState(false)
  const [summaryDismissed, setSummaryDismissed] = useState(false)

  // Check if TTS is active for this entry
  const isTtsActiveForThisEntry = audioPlayer.source === "tts" && audioPlayer.activeEntryId === entry?.id

  // Swipe navigation for mobile - swipe left/right to navigate articles.
  //
  // handleAdvanceToNext has two callers: the left swipe and the button at the
  // end of the article body. They are the same action reached two ways, so they
  // share the handler rather than each carrying its own copy of the hasNext
  // guard, which is what would let the two paths drift (ttrb-fixw).
  const handleAdvanceToNext = useCallback(() => {
    if (hasNext) onNext()
  }, [hasNext, onNext])

  const handleSwipeRight = useCallback(() => {
    if (hasPrevious) onPrevious()
  }, [hasPrevious, onPrevious])

  const swipeRef = useSwipeNavigation<HTMLDivElement>({
    onSwipeLeft: handleAdvanceToNext,
    onSwipeRight: handleSwipeRight,
    enabled: layout.isMobile && !!entry,
    threshold: 60,
  })

  // A frame refused by X-Frame-Options or CSP frame-ancestors still fires
  // `load` and never `error`, so the iframe element cannot report the refusal
  // and the reader would just get a blank white panel. The server reads the
  // page's own headers instead; see useEmbedPolicy and EmbedPolicyProbe.
  const embedPolicy = useEmbedPolicy({
    entryId: entry?.id ?? null,
    enabled: showIframe && !!entry,
  })

  // The embedded page is a separate document, so keydown never reaches the
  // shortcuts registered here once focus moves into it. The guard keeps focus
  // anchored on the wrapper through j/k navigation and reports the handoff when
  // the reader clicks into the frame anyway.
  const iframeFocus = useIframeFocusGuard<HTMLDivElement>({
    enabled: showIframe && !!entry && !embedPolicy.blocked,
    resetKey: entry?.id ?? null,
  })

  // TWO IDS, and they are different numbers. The POST goes through this user's
  // UserEntry, which is what every /api/v1/entries route is keyed on, while the
  // channel is keyed on the shared Entry because an EntrySummary hangs off that
  // and one generation serves every reader of the article.
  //
  // `summary` comes down with the full-content fetch, so re-opening a
  // summarized article costs no request and no model time. Nothing here starts
  // a generation; only handleToggleSummary and the callout's regenerate control
  // do, and both are a press.
  const entrySummary = useEntrySummary({
    id: entry?.id ?? null,
    entryId: entry?.entry_id ?? null,
    initialSummary: entry?.summary ?? null,
  })

  // Reset state when entry changes
  useEffect(() => {
    setIsEditingNote(false)
    setNoteText(entry?.note || "")
    // A dismissal is about one article. The next one opens with its own cached
    // summary showing, if it has one.
    setSummaryDismissed(false)
    // The scroll viewport survives the entry swap, so a new article would
    // otherwise open at the previous one's scroll position.
    if (scrollViewportRef?.current) {
      scrollViewportRef.current.scrollTop = 0
    }
  }, [entry?.id])

  const handleStartEditNote = () => {
    setNoteText(entry?.note || "")
    setIsEditingNote(true)
  }

  const handleCancelNote = () => {
    setNoteText(entry?.note || "")
    setIsEditingNote(false)
  }

  // Named rather than inlined because the header button and the overflow menu
  // both open this dialog, and a second arrow function would be a copy that can
  // drift (ttrb-tyvd).
  const handleFollowStory = () => {
    setFollowStoryOpen(true)
  }

  // "idle" is the one state with nothing to show, so it is also the only state
  // in which the button spends model time. Everything else -- a wait in
  // progress, a paragraph, a refusal -- is already worth a panel, so the button
  // is a disclosure for it and regeneration lives on the panel's own controls.
  const summaryVisible = entrySummary.state !== "idle" && !summaryDismissed

  const handleToggleSummary = () => {
    if (summaryVisible) {
      setSummaryDismissed(true)
      return
    }

    setSummaryDismissed(false)
    if (entrySummary.state === "idle") void entrySummary.request()
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

  // Headline-only and link-only items are a normal RSS shape, so an entry with
  // no body is expected rather than broken. Injecting "" would render a
  // zero-height prose block and leave the reader staring at a header over
  // whitespace with no hint that the whole article is one click away.
  const hasBody = processedContent.trim().length > 0

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

  // Position within the loaded list, 1-based for display. -1 means the entry is
  // not in the list currently loaded (an entry opened by permalink, say), and
  // an invented "1 of 1" would be worse than saying nothing.
  const hasPosition = entryIndex >= 0 && entryCount > 0
  // Outside focus mode the list pane is right there with the same two facts, so
  // this would only be duplicate chrome competing for a narrow content header.
  const showListContext = focusMode && (hasPosition || !!listTitle)

  // Below EntrySummarizer::MIN_CONTENT_CHARS the server refuses, so offering
  // the control would be offering something that cannot happen. Andy's call on
  // ttrb-ewz4: say the feed publishes an excerpt only rather than render a
  // disabled button with no explanation. `summarizable` is absent on the list
  // payload, so only an explicit false suppresses the control -- and a summary
  // written before the article shrank is still worth reaching.
  const summaryOffered = entry.summarizable !== false || entrySummary.summary !== null
  const summaryInFlight = entrySummary.state === "queued" || entrySummary.state === "running"
  const summaryButtonLabel = summaryVisible
    ? "Hide summary"
    : entrySummary.state === "idle"
      ? "Summarize this article"
      : "Show summary"

  return (
    <div ref={swipeRef} className="h-full flex flex-col">
      <div
        data-testid="entry-header"
        className="h-12 px-3 flex items-center gap-2 border-b border-border shrink-0"
      >
        <div className="flex items-center gap-1 shrink-0">
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
          {/* Shown only while the embedded page holds the keys. The rest of the
              time the shortcuts work and this would be noise. */}
          {showIframe && iframeFocus.keyboardHandedOff && (
            <Button
              variant="outline"
              size="sm"
              onClick={iframeFocus.reclaimKeyboard}
              className="ml-1 h-7 gap-1.5 px-2 text-xs"
              title="The embedded page has keyboard focus. Click to restore Nibbler's shortcuts."
            >
              <Keyboard className="h-3.5 w-3.5" />
              Restore shortcuts
            </Button>
          )}
        </div>
        {/* The header's flexible middle: focus mode's list context, and the
            copy indicator. Rendered even when both are empty, so the action
            cluster on the right keeps its position whatever appears here -- a
            2-second chip that shoved the buttons sideways and back would be
            worse than no confirmation at all. */}
        <div className="flex-1 min-w-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          {showListContext && (
            <>
              {listTitle && (
                <span className="truncate" title={listTitle}>
                  {listTitle}
                </span>
              )}
              {hasPosition && (
                <span
                  className="shrink-0 tabular-nums"
                  title={`Entry ${entryIndex + 1} of ${entryCount}`}
                >
                  {entryIndex + 1} / {entryCount}
                </span>
              )}
            </>
          )}
          {/* The only evidence a keystroke produced anything: `c` has no button
              to relabel the way the two copy buttons elsewhere in the app do,
              and a silent success is indistinguishable from a silent failure.

              aria-live rather than role="status" because EntrySummaryCallout
              already puts a status region in this subtree, and two of them
              make every getByRole("status") in this pane ambiguous. The two
              roles are equivalent to polite + atomic, which is what is set
              here. The element is mounted empty from first paint: assistive
              tech announces a live region inserted together with its text
              unreliably. */}
          <span
            data-testid="copy-link-status"
            aria-live="polite"
            aria-atomic="true"
            className={cn(
              "shrink-0 flex items-center gap-1",
              copyLinkStatus === "copied" && "text-success",
              copyLinkStatus === "error" && "text-destructive-text"
            )}
          >
            {/* Below xs the eight header buttons leave about 60px, and the
                label needs half again that: measured at 375px it overhung the
                read button by 17px. `sr-only` rather than `hidden` keeps the
                words in the accessibility tree, so the announcement is the
                same sentence at every width and only the icon is dropped from
                the phone's view -- where the copy was a tap on a menu row that
                said "Copy link" a moment earlier. */}
            {copyLinkStatus === "copied" && (
              <>
                <Check className="h-3.5 w-3.5" />
                <span className="sr-only xs:not-sr-only">Link copied</span>
              </>
            )}
            {copyLinkStatus === "error" && (
              <>
                <TriangleAlert className="h-3.5 w-3.5" />
                <span className="sr-only xs:not-sr-only">Copy failed</span>
              </>
            )}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
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
          {onTogglePublished && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onTogglePublished}
              aria-label={entry.is_published ? "Remove from public feed" : "Add to public feed"}
              title={entry.is_published ? "Remove from public feed" : "Add to public feed"}
            >
              <Rss
                className="h-4 w-4"
                style={entry.is_published ? {
                  fill: "var(--color-accent-secondary)",
                  color: "var(--color-accent-secondary)",
                } : undefined}
              />
            </Button>
          )}
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
          {/* Follow this story - hidden on small mobile */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleFollowStory}
            aria-label="Follow this story"
            title="Follow this story"
            className="hidden xs:inline-flex"
          >
            <Bookmark className="h-4 w-4" />
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
          {/* Overflow menu - the only way to reach the four actions above that
              this header sheds as it narrows. Hides itself at the width where
              nothing is missing any more; see EntryActionsMenu. */}
          <EntryActionsMenu
            entry={entry}
            showIframe={showIframe}
            onToggleIframe={onToggleIframe}
            onEditNote={onUpdateNote ? handleStartEditNote : undefined}
            onScoreChange={onScoreChange}
            onFollowStory={handleFollowStory}
            onCopyLink={onCopyLink}
          />
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
        // tabIndex makes the wrapper focusable so the guard has somewhere in
        // this document to park focus; it is never reached by tabbing.
        <div
          ref={iframeFocus.anchorRef}
          tabIndex={-1}
          className="flex-1 min-h-0 flex flex-col outline-none"
        >
          {embedPolicy.blocked ? (
            <div
              data-testid="embed-blocked-fallback"
              className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4 p-6"
              /* The refusing header, for anyone wondering which site did what. */
              title={embedPolicy.reason ?? undefined}
            >
              <Globe className="h-12 w-12 opacity-50" />
              <p className="font-medium text-center">This site blocks embedding</p>
              {/* This used to read "Press i to read the feed's copy instead",
                  which is advice a phone reader cannot take: there is no
                  keyboard, and below the xs breakpoint the header's framing
                  toggle is not on screen either (ttrb-tyvd). The way out is a
                  button now, on the same handler as that toggle; the shortcut
                  survives as its tooltip, where it costs a touch reader
                  nothing. */}
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="outline"
                  onClick={onToggleIframe}
                  title="Show RSS content (i)"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Show the feed's copy
                </Button>
                <Button variant="outline" asChild>
                  <a href={entry.link} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in new tab
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <iframe
              /* Keyed on the entry so the frame is a fresh element per article
                 rather than one that is re-pointed. The isLoading branch above
                 already unmounts this whole subtree on every entry change, so
                 the key changes nothing today; it is here so that walking j/k
                 cannot silently start showing the previous article's page if
                 that loading flash is ever removed (ttrb-mq4n). */
              key={entry.id}
              ref={iframeFocus.frameRef}
              src={entry.link}
              className="flex-1 w-full border-0"
              title={entry.title}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              onLoad={iframeFocus.handleFrameLoad}
            />
          )}
        </div>
      ) : (
      /*
        Built from the Radix primitives instead of <ScrollArea> because this
        pane needs a horizontal scrollbar and the shared wrapper mounts only a
        vertical one. Everything else here is that wrapper's own markup; the
        styled ScrollBar is imported from it so both bars stay one component.

        Mounting the horizontal bar is the whole fix (ttrb-qgjc). Radix sets the
        viewport's `overflow-x` from whether a horizontal scrollbar exists -
        `scroll` if one does, `hidden` if none does
        (@radix-ui/react-scroll-area 1.2.18, dist/index.mjs:121) - while the
        wrapper it puts around the children is `min-width: 100%; display: table`
        and so sizes to its content. With only a vertical bar, a table or pre
        block wider than the pane laid out at full width inside a box that
        refused every gesture: 632px of columns the reader could not reach by
        wheel, trackpad or drag. Feeds publish such tables routinely.

        This is the opposite of the sidebar's fix for the same mechanism
        (ttrb-rdnc, 0b5c261), which forced that wrapper to `display: block` so
        row titles would truncate. Prose wants the content-width sizing kept: a
        wide table should stay wide and become scrollable, not be squeezed.

        The bar is Radix's default `type="hover"`, so it is mounted at all times
        - that is what makes the viewport scrollable - but its thumb only paints
        while the pointer is over the pane AND the content actually overflows. A
        bar standing under every article would be its own regression.
      */
      <ScrollAreaPrimitive.Root
        data-slot="scroll-area"
        className="relative overflow-hidden flex-1 min-h-0"
      >
      <ScrollAreaPrimitive.Viewport
        ref={scrollViewportRef}
        data-slot="scroll-area-viewport"
        className="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1"
      >
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
            {onAddTag && onRemoveTag && (
              <div className="mt-2">
                <SuggestedTags
                  entryId={entry.id}
                  existingTags={(entry.tags || []).map(t => t.name)}
                  allTags={allTags}
                  onAddTag={onAddTag}
                  onRemoveTag={onRemoveTag}
                />
              </div>
            )}
            {/* Article actions. Only the two TTS controls are gated on
                playback -- they are the ones that would offer to start what is
                already running. The summary control has nothing to do with
                audio, so it stays put while the article is being read aloud,
                which is exactly when a reader might want the paragraph.

                Not mirrored into EntryActionsMenu, unlike the header toolbar's
                controls: that menu exists for what the header sheds as the
                viewport narrows (ttrb-tyvd), and this row sheds nothing. The
                summary control is on screen at every width already, and the
                menu is drawn in iframe view too, where there is nowhere for the
                callout to appear. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!isTtsActiveForThisEntry && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => audioPlayer.playNow({
                      entryId: entry.id,
                      entryTitle: entry.title,
                      feedTitle: entry.feed_title || undefined,
                      source: "tts",
                    })}
                    title="Listen to article"
                  >
                    <Play className="h-4 w-4" />
                    Listen
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => audioPlayer.addToQueue({
                      entryId: entry.id,
                      entryTitle: entry.title,
                      feedTitle: entry.feed_title || undefined,
                      source: "tts",
                    })}
                    title="Add to queue"
                  >
                    <ListPlus className="h-4 w-4" />
                  </Button>
                </>
              )}
              {summaryOffered ? (
                /* lucide-react marks its svg aria-hidden when the icon has no
                   children and no a11y prop, so this label is the button's
                   entire accessible name. Without it the control is
                   unreachable by a screen reader and by getByRole. */
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleToggleSummary}
                  aria-label={summaryButtonLabel}
                  aria-expanded={summaryVisible}
                  title={summaryButtonLabel}
                >
                  {summaryInFlight ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  No summary: this feed publishes an excerpt only.
                </span>
              )}
            </div>
          </header>

          {/* Between the header and the article, so a triage decision is made
              before any of the piece has been read. Present only on this
              branch: in iframe view the text on screen is the publisher's page
              rather than the feed's copy, which is what would be summarized,
              so the paragraph would be describing something else. */}
          <EntrySummaryCallout
            visible={summaryVisible}
            state={entrySummary.state}
            summary={entrySummary.summary}
            message={entrySummary.message}
            contentLength={entrySummary.contentLength}
            connection={entrySummary.connection}
            onRegenerate={() => void entrySummary.request()}
            onDismiss={() => setSummaryDismissed(true)}
          />

          {entry.enclosures && entry.enclosures.length > 0 && (
            <EnclosurePlayer
              enclosures={entry.enclosures}
              entryId={entry.id}
              entryTitle={entry.title}
              feedTitle={entry.feed_title ?? undefined}
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
          ) : hasBody ? (
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
          ) : (
            <div className="rounded-md border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">
                This item has no article text. The feed published a headline and a link only.
              </p>
              {/* The header carries icon-only controls for both of these, but
                  they are unlabelled and the framing toggle is hidden below the
                  xs breakpoint. Naming them here is the only in-place hint that
                  the article is one click away. The wording is deliberately
                  different from the header's so the two do not collide as
                  duplicate accessible names. */}
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Button variant="outline" size="sm" onClick={onToggleIframe}>
                  <Globe className="h-4 w-4 mr-1" />
                  Read the page here
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={entry.link} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Open the original site
                  </a>
                </Button>
              </div>
            </div>
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
        {/*
          The end of the text is where a scroll reader has decided to move on,
          and until now there was nothing there: advancing meant a horizontal
          swipe or the back-to-list pane, both gestures made with the article
          still on screen (ttrb-fixw).

          Drawn at every width, not just on mobile. A desktop reader who scrolls
          reaches the same dead end, and a keyboard reader never scrolls this
          far, so `j` costs nothing by this existing.

          Outside <article> because it is not part of the article, but inside
          the Viewport so it is reached by scrolling rather than floating over
          the text. It repeats the article's own max-w-3xl mx-auto so the two
          columns line up.

          onClick is handleAdvanceToNext, the same callback the left swipe gets,
          and that runs the `onNext` prop -- which is the handler `j` is bound
          to in application.tsx. One path, four entry points.
        */}
        <nav
          aria-label="Continue reading"
          data-testid="end-of-article-nav"
          className="max-w-3xl mx-auto px-4 pb-6 sm:px-6 sm:pb-8"
        >
          {hasNext ? (
            <Button
              variant="outline"
              /* h-auto and whitespace-normal undo the Button base's fixed
                 height and nowrap: an article title is as long as it is, and at
                 375px it has to wrap rather than overhang the border. */
              className="w-full h-auto justify-between gap-3 py-3 text-left whitespace-normal"
              onClick={handleAdvanceToNext}
            >
              <span className="flex min-w-0 flex-col items-start gap-0.5">
                <span className="text-xs font-normal text-muted-foreground">
                  Next article
                </span>
                {nextEntryTitle && (
                  <span className="font-medium">{nextEntryTitle}</span>
                )}
              </span>
              {/* lucide sets aria-hidden on the svg, so the two spans above are
                  this button's entire accessible name. "Next article" carries
                  it on its own when no title was passed. */}
              <ChevronRight className="h-4 w-4 shrink-0" />
            </Button>
          ) : (
            /* No dead action at the end of the list. The keyboard boundary
               flash is the wrong treatment here: that answers a keypress that
               had nowhere to go, while this is known before the reader presses
               anything, so it says so instead. */
            <p className="border-t pt-4 text-center text-sm text-muted-foreground">
              That was the last article in this list.
            </p>
          )}
        </nav>
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollBar orientation="horizontal" />
      <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>
      )}
      <FollowStoryDialog
        open={followStoryOpen}
        onOpenChange={setFollowStoryOpen}
        entryId={entry?.id ?? null}
        onStoryCreated={onFollowStoryCreated}
      />
    </div>
  )
}
