import { useEffect, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CheckCheck, Star, Circle, StickyNote, ArrowUpDown, Eye, EyeOff, ExternalLink, MoreHorizontal, RefreshCw, Pencil, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePreferences } from "@/contexts/PreferencesContext"
import { useDateFormat } from "@/hooks/useDateFormat"
import { ScoreBadge } from "@/components/ScoreButtons"
import type { Entry, Feed } from "@/lib/api"

interface EntryListProps {
  entries: Entry[]
  selectedEntryId: number | null
  onSelectEntry: (entryId: number) => void
  onToggleRead: (entryId: number) => void
  onToggleStarred: (entryId: number) => void
  onMarkAllRead: () => void
  isLoading: boolean
  title: string
  // Fresh view parameters
  isFreshView?: boolean
  freshMaxAge?: "week" | "month" | "all"
  freshPerFeed?: number | null
  onFreshMaxAgeChange?: (value: "week" | "month" | "all") => void
  onFreshPerFeedChange?: (value: number | null) => void
  // Single feed view
  selectedFeed?: Feed | null
  onRefreshFeed?: (feedId: number) => void
  onEditFeed?: (feed: Feed) => void
  onDeleteFeed?: (feedId: number) => void
}

export function EntryList({
  entries,
  selectedEntryId,
  onSelectEntry,
  onToggleRead,
  onToggleStarred,
  onMarkAllRead,
  isLoading,
  title,
  isFreshView,
  freshMaxAge,
  freshPerFeed,
  onFreshMaxAgeChange,
  onFreshPerFeedChange,
  selectedFeed,
  onRefreshFeed,
  onEditFeed,
  onDeleteFeed,
}: EntryListProps) {
  const { preferences, updatePreference } = usePreferences()
  const { formatListDate } = useDateFormat()

  // Helper to format relative time (e.g., "2h ago", "3d ago")
  const formatRelativeTime = (dateStr: string | null): string => {
    if (!dateStr) return "never"
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 30) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  // Helper to format date range (e.g., "2019 — 2024" or "2024")
  const formatDateRange = (oldest: string | null, newest: string | null): string | null => {
    if (!oldest || !newest) return null
    const oldestYear = new Date(oldest).getFullYear()
    const newestYear = new Date(newest).getFullYear()
    return oldestYear === newestYear ? String(oldestYear) : `${oldestYear} — ${newestYear}`
  }

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
      {/* Fresh view parameters */}
      {isFreshView && onFreshMaxAgeChange && onFreshPerFeedChange && (
        <div className="px-3 py-1.5 flex items-center gap-3 border-b border-border shrink-0 bg-muted/20 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">time:</span>
            <select
              value={freshMaxAge}
              onChange={(e) => onFreshMaxAgeChange(e.target.value as "week" | "month" | "all")}
              className="bg-background border border-border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="week">week</option>
              <option value="month">month</option>
              <option value="all">all</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">per:</span>
            <select
              value={freshPerFeed ?? ""}
              onChange={(e) => {
                const val = e.target.value
                onFreshPerFeedChange(val === "" ? null : parseInt(val, 10))
              }}
              className="bg-background border border-border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="3">3</option>
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="">∞</option>
            </select>
          </div>
        </div>
      )}
      {/* Single feed toolbar */}
      {selectedFeed && (
        <div className="px-3 py-1.5 flex items-center gap-2 border-b border-border shrink-0 bg-muted/20 text-xs">
          <span className="text-muted-foreground">
            Updated {formatRelativeTime(selectedFeed.last_successful_update)}
          </span>
          {selectedFeed.site_url && (
            <a
              href={selectedFeed.site_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              title="Open source website"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <span className="text-muted-foreground">{selectedFeed.entry_count} items</span>
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {formatDateRange(selectedFeed.oldest_entry_date, selectedFeed.newest_entry_date) && (
                <>
                  <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                    Activity: {formatDateRange(selectedFeed.oldest_entry_date, selectedFeed.newest_entry_date)}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {onRefreshFeed && (
                <DropdownMenuItem onClick={() => onRefreshFeed(selectedFeed.id)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync now
                </DropdownMenuItem>
              )}
              {onEditFeed && (
                <DropdownMenuItem onClick={() => onEditFeed(selectedFeed)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit feed
                </DropdownMenuItem>
              )}
              {onDeleteFeed && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDeleteFeed(selectedFeed.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Unsubscribe
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
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
  displayDensity: "small" | "medium" | "large"
  formatDate: (date: Date | string) => string
}

function EntryItem({ entry, isSelected, onSelect, onToggleRead, onToggleStarred, displayDensity, formatDate }: EntryItemProps) {
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
          <ScoreBadge score={entry.score} size="sm" />
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
