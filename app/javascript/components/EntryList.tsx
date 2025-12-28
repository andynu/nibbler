import { useEffect, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCheck, Star, Circle, StickyNote, ChevronUp, ChevronDown, ArrowUpDown, Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePreferences } from "@/contexts/PreferencesContext"
import { useDateFormat } from "@/hooks/useDateFormat"
import type { Entry } from "@/lib/api"

interface EntryListProps {
  entries: Entry[]
  selectedEntryId: number | null
  onSelectEntry: (entryId: number) => void
  onToggleRead: (entryId: number) => void
  onToggleStarred: (entryId: number) => void
  onUpdateScore?: (entryId: number, delta: number) => void
  onMarkAllRead: () => void
  isLoading: boolean
  title: string
}

export function EntryList({
  entries,
  selectedEntryId,
  onSelectEntry,
  onToggleRead,
  onToggleStarred,
  onUpdateScore,
  onMarkAllRead,
  isLoading,
  title,
}: EntryListProps) {
  const { preferences, updatePreference } = usePreferences()
  const { formatListDate } = useDateFormat()
  const sortByScore = preferences.entries_sort_by_score === "true"
  const hideRead = preferences.entries_hide_read === "true"
  const hideUnstarred = preferences.entries_hide_unstarred === "true"
  const displayDensity = (preferences.entries_display_density || "medium") as "small" | "medium" | "large"
  const unreadCount = entries.filter((e) => e.unread).length
  const listRef = useRef<HTMLDivElement>(null)

  const toggleSortByScore = () => {
    updatePreference("entries_sort_by_score", sortByScore ? "false" : "true")
  }

  const toggleHideRead = () => {
    updatePreference("entries_hide_read", hideRead ? "false" : "true")
  }

  const toggleHideUnstarred = () => {
    updatePreference("entries_hide_unstarred", hideUnstarred ? "false" : "true")
  }

  const setDisplayDensity = (density: "small" | "medium" | "large") => {
    updatePreference("entries_display_density", density)
  }

  // Auto-scroll selected entry into view (for keyboard navigation)
  useEffect(() => {
    if (selectedEntryId && listRef.current) {
      const selectedElement = listRef.current.querySelector(`[data-entry-id="${selectedEntryId}"]`)
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest", behavior: "smooth" })
      }
    }
  }, [selectedEntryId])

  return (
    <div className="h-full flex flex-col border-r border-border">
      {/* Title bar */}
      <div className="h-12 px-3 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{title}</span>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="shrink-0">
              {unreadCount}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onMarkAllRead}
          disabled={unreadCount === 0}
          className="shrink-0"
        >
          <CheckCheck className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Mark read</span>
        </Button>
      </div>
      {/* Filter & display toolbar */}
      <div className="px-2 py-1.5 flex items-center justify-center gap-1 border-b border-border shrink-0 bg-muted/30">
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7", hideRead && "text-primary bg-primary/10")}
          onClick={toggleHideRead}
          aria-label={hideRead ? "Show read entries" : "Hide read entries"}
          title={hideRead ? "Showing unread only" : "Hide read entries"}
        >
          {hideRead ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7", hideUnstarred && "text-primary bg-primary/10")}
          onClick={toggleHideUnstarred}
          aria-label={hideUnstarred ? "Show unstarred entries" : "Hide unstarred entries"}
          title={hideUnstarred ? "Showing starred only" : "Hide unstarred entries"}
        >
          <Star className={cn("h-4 w-4", hideUnstarred && "fill-current")} />
        </Button>
        <div className="w-px h-4 bg-border mx-1" />
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7", sortByScore && "text-primary bg-primary/10")}
          onClick={toggleSortByScore}
          aria-label={sortByScore ? "Sort by date" : "Sort by score"}
          title={sortByScore ? "Sorted by score" : "Sort by score"}
        >
          <ArrowUpDown className="h-4 w-4" />
        </Button>
        <div className="w-px h-4 bg-border mx-1" />
        {/* Density selector: S M L */}
        <div className="flex items-center rounded-md border border-border overflow-hidden">
          <button
            className={cn(
              "px-2 py-0.5 text-xs font-medium transition-colors",
              displayDensity === "small" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            )}
            onClick={() => setDisplayDensity("small")}
            aria-label="Compact view"
            title="Compact: title only"
          >
            S
          </button>
          <button
            className={cn(
              "px-2 py-0.5 text-xs font-medium border-x border-border transition-colors",
              displayDensity === "medium" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            )}
            onClick={() => setDisplayDensity("medium")}
            aria-label="Medium view"
            title="Medium: title + feed/date"
          >
            M
          </button>
          <button
            className={cn(
              "px-2 py-0.5 text-xs font-medium transition-colors",
              displayDensity === "large" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            )}
            onClick={() => setDisplayDensity("large")}
            aria-label="Expanded view"
            title="Expanded: title + feed/date + preview"
          >
            L
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div ref={listRef}>
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">No entries</div>
          ) : (
            <div className="p-1">
              {entries.map((entry) => (
                <EntryItem
                  key={entry.id}
                  entry={entry}
                  isSelected={selectedEntryId === entry.id}
                  onSelect={() => onSelectEntry(entry.id)}
                  onToggleRead={() => onToggleRead(entry.id)}
                  onToggleStarred={() => onToggleStarred(entry.id)}
                  onScoreUp={onUpdateScore && displayDensity !== "small" ? () => onUpdateScore(entry.id, 1) : undefined}
                  onScoreDown={onUpdateScore && displayDensity !== "small" ? () => onUpdateScore(entry.id, -1) : undefined}
                  displayDensity={displayDensity}
                  formatDate={formatListDate}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

interface EntryItemProps {
  entry: Entry
  isSelected: boolean
  onSelect: () => void
  onToggleRead: () => void
  onToggleStarred: () => void
  onScoreUp?: () => void
  onScoreDown?: () => void
  displayDensity: "small" | "medium" | "large"
  formatDate: (date: Date | string) => string
}

function EntryItem({ entry, isSelected, onSelect, onToggleRead, onToggleStarred, onScoreUp, onScoreDown, displayDensity, formatDate }: EntryItemProps) {
  const formattedDate = formatDate(entry.published)
  const showFeedAndDate = displayDensity !== "small"
  const showContentPreview = displayDensity === "large"

  return (
    <div
      data-entry-id={entry.id}
      data-unread={entry.unread}
      role="option"
      aria-selected={isSelected}
      className={cn(
        "p-2 rounded-md cursor-pointer hover:bg-accent/50 transition-colors",
        isSelected && "bg-accent ring-2 ring-offset-1 ring-offset-background",
        entry.unread && "border-l-2"
      )}
      style={{
        ...(entry.unread ? { borderLeftColor: "var(--color-accent-secondary)" } : {}),
        ...(isSelected ? { "--tw-ring-color": "var(--color-accent-primary)" } as React.CSSProperties : {}),
      }}
      onClick={onSelect}
    >
      <div className="flex items-start gap-2">
        <button
          className="mt-1 p-0.5 hover:bg-background rounded shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            onToggleRead()
          }}
          aria-label={entry.unread ? "Mark as read" : "Mark as unread"}
        >
          <Circle
            className="h-3 w-3"
            style={entry.unread ? {
              fill: "var(--color-accent-secondary)",
              color: "var(--color-accent-secondary)",
            } : undefined}
          />
        </button>
        <div className="flex-1 min-w-0">
          <div className={cn("text-sm leading-snug line-clamp-2", entry.unread ? "font-medium" : "text-muted-foreground")}>
            {entry.title}
          </div>
          {showContentPreview && entry.content_preview && (
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {entry.content_preview}
            </div>
          )}
          {showFeedAndDate && (
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              {entry.feed_title && (
                <>
                  <span className="truncate max-w-[120px]">{entry.feed_title}</span>
                  <span>·</span>
                </>
              )}
              <span className="whitespace-nowrap">{formattedDate}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {entry.score !== 0 && (
            <span
              className={cn(
                "text-xs font-medium px-1",
                entry.score > 0 && "text-green-600 dark:text-green-400",
                entry.score < 0 && "text-red-600 dark:text-red-400"
              )}
              aria-label={`Score: ${entry.score}`}
            >
              {entry.score > 0 ? `+${entry.score}` : entry.score}
            </span>
          )}
          {onScoreUp && onScoreDown && (
            <div className="flex flex-col -my-1">
              <button
                className="p-0 hover:bg-background rounded leading-none"
                onClick={(e) => {
                  e.stopPropagation()
                  onScoreUp()
                }}
                aria-label="Increase score"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                className="p-0 hover:bg-background rounded leading-none"
                onClick={(e) => {
                  e.stopPropagation()
                  onScoreDown()
                }}
                aria-label="Decrease score"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          )}
          {entry.note && (
            <span className="p-0.5" aria-label="Has note">
              <StickyNote
                className="h-4 w-4"
                style={{
                  color: "var(--color-accent-secondary)",
                }}
              />
            </span>
          )}
          <button
            className="p-0.5 hover:bg-background rounded"
            onClick={(e) => {
              e.stopPropagation()
              onToggleStarred()
            }}
            aria-label={entry.starred ? "Remove star" : "Add star"}
          >
            <Star
              className="h-4 w-4"
              style={entry.starred ? {
                fill: "var(--color-accent-secondary)",
                color: "var(--color-accent-secondary)",
              } : undefined}
            />
          </button>
        </div>
      </div>
    </div>
  )
}
