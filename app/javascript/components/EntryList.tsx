import { useState, useEffect, useRef } from "react"
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
import { CheckCheck, Star, Circle, StickyNote, Eye, EyeOff, ExternalLink, MoreHorizontal, RefreshCw, Pencil, Trash2, Rss, AlertCircle, Menu } from "lucide-react"
import { cn } from "@/lib/utils"
import { getTagColor } from "@/lib/tag-colors"
import { usePreferences } from "@/contexts/PreferencesContext"
import { useDateFormat } from "@/hooks/useDateFormat"
import { ScoreBadge } from "@/components/ScoreButtons"
import { SortableHeaderRow, toggleSort } from "@/components/SortableColumnHeader"
import { SortDropdown } from "@/components/SortDropdown"
import type { Entry, Feed, SortConfig, SortColumn } from "@/lib/api"

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
  // Feed-list mode (for virtual folders showing feeds)
  displayMode?: "entries" | "feeds"
  filteredFeeds?: Feed[]
  onSelectFeedFromList?: (feedId: number) => void
  // Keyboard navigation boundary feedback
  boundaryHit?: "start" | "end" | null
  // Multi-column sorting
  sortConfig?: SortConfig[]
  onSortChange?: (newSort: SortConfig[]) => void
  // Mobile navigation
  onShowSidebar?: () => void
  // Tag management
  onAddTag?: (entryId: number, tagName: string) => void
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
  displayMode = "entries",
  filteredFeeds = [],
  onSelectFeedFromList,
  boundaryHit,
  sortConfig = [],
  onSortChange,
  onShowSidebar,
  onAddTag,
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

  const hideRead = preferences.entries_hide_read === "true"
  const hideUnstarred = preferences.entries_hide_unstarred === "true"
  const displayDensity = (preferences.entries_display_density || "medium") as "small" | "medium" | "large"
  const unreadCount = entries.filter((e) => e.unread).length
  const listRef = useRef<HTMLDivElement>(null)

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
          {onShowSidebar && (
            <Button variant="ghost" size="icon" onClick={onShowSidebar} aria-label="Show sidebar">
              <Menu className="h-4 w-4" />
            </Button>
          )}
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
      {/* Sort controls - only show when entries mode and sort handler provided */}
      {displayMode === "entries" && onSortChange && (
        <>
          {/* Mobile: dropdown */}
          <div className="sm:hidden px-2 py-1.5 border-b border-border bg-muted/20">
            <SortDropdown
              currentSort={sortConfig}
              onSortChange={onSortChange}
              className="w-full h-8 text-xs"
            />
          </div>
          {/* Desktop: column headers */}
          <SortableHeaderRow
            currentSort={sortConfig}
            onSort={(column: SortColumn, additive: boolean) => {
              const newSort = toggleSort(sortConfig, column, additive)
              onSortChange(newSort)
            }}
            className="hidden sm:flex"
          />
        </>
      )}

      <ScrollArea className="flex-1 min-h-0">
        <div ref={listRef}>
          {displayMode === "feeds" ? (
            // Feed-list mode: show filtered feeds
            filteredFeeds.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">No feeds</div>
            ) : (
              <div className="p-1">
                {filteredFeeds.map((feed) => (
                  <div
                    key={feed.id}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
                      "hover:bg-accent"
                    )}
                    onClick={() => onSelectFeedFromList?.(feed.id)}
                  >
                    <div className="shrink-0">
                      {feed.icon_url ? (
                        <img
                          src={feed.icon_url}
                          alt=""
                          className="h-4 w-4 rounded"
                          onError={(e) => {
                            e.currentTarget.style.display = "none"
                          }}
                        />
                      ) : (
                        <Rss className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{feed.title}</div>
                      {feed.category_title && (
                        <div className="text-xs text-muted-foreground truncate">
                          {feed.category_title}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                      {feed.last_error && (
                        <AlertCircle className="h-3.5 w-3.5 text-destructive" title={feed.last_error} />
                      )}
                      {feed.newest_entry_date && (
                        <span title={`Last post: ${new Date(feed.newest_entry_date).toLocaleDateString()}`}>
                          {formatRelativeTime(feed.newest_entry_date)}
                        </span>
                      )}
                      {feed.unread_count > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {feed.unread_count}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            // Entry-list mode: show entries (default)
            isLoading ? (
              <div className="p-4 text-center text-muted-foreground">Loading...</div>
            ) : entries.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">No entries</div>
            ) : (
              <div className="p-1">
                {entries.map((entry, index) => (
                  <EntryItem
                    key={entry.id}
                    entry={entry}
                    isSelected={selectedEntryId === entry.id}
                    onSelect={() => onSelectEntry(entry.id)}
                    onToggleRead={() => onToggleRead(entry.id)}
                    onToggleStarred={() => onToggleStarred(entry.id)}
                    displayDensity={displayDensity}
                    formatDate={formatListDate}
                    showBoundaryFlash={
                      (boundaryHit === "start" && index === 0) ||
                      (boundaryHit === "end" && index === entries.length - 1)
                    }
                    onAddTag={onAddTag ? (tagName) => onAddTag(entry.id, tagName) : undefined}
                  />
                ))}
              </div>
            )
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
  showBoundaryFlash?: boolean
  onAddTag?: (tagName: string) => void
}

function EntryItem({ entry, isSelected, onSelect, onToggleRead, onToggleStarred, displayDensity, formatDate, showBoundaryFlash, onAddTag }: EntryItemProps) {
  const formattedDate = formatDate(entry.published)
  const showFeedAndDate = displayDensity !== "small"
  const showContentPreview = displayDensity === "large"
  const showTags = displayDensity === "large" && ((entry.tags && entry.tags.length > 0) || (entry.detected_tags && entry.detected_tags.length > 0))

  return (
    <div
      data-entry-id={entry.id}
      data-unread={entry.unread}
      role="option"
      aria-selected={isSelected}
      className={cn(
        // Base styles with larger padding on mobile for touch targets
        "p-2 sm:p-2 rounded-md cursor-pointer hover:bg-accent/50 transition-colors",
        isSelected && "bg-accent ring-2 ring-offset-1 ring-offset-background",
        entry.unread && "border-l-2",
        showBoundaryFlash && "animate-boundary-flash"
      )}
      style={{
        ...(entry.unread ? { borderLeftColor: "var(--color-accent-secondary)" } : {}),
        ...(isSelected ? { "--tw-ring-color": "var(--color-accent-primary)" } as React.CSSProperties : {}),
      }}
      onClick={onSelect}
    >
      <div className="flex items-start gap-2 sm:gap-2">
        {/* Read indicator - larger touch target on mobile */}
        <button
          className="mt-0.5 p-1.5 sm:p-0.5 -m-1 sm:m-0 hover:bg-background rounded shrink-0 min-w-[28px] sm:min-w-0"
          onClick={(e) => {
            e.stopPropagation()
            onToggleRead()
          }}
          aria-label={entry.unread ? "Mark as read" : "Mark as unread"}
        >
          <Circle
            className="h-3.5 w-3.5 sm:h-3 sm:w-3"
            style={entry.unread ? {
              fill: "var(--color-accent-secondary)",
              color: "var(--color-accent-secondary)",
            } : undefined}
          />
        </button>
        <div className="flex-1 min-w-0">
          {/* Title - slightly larger on mobile for readability */}
          <div className={cn(
            "text-sm sm:text-sm leading-snug line-clamp-2",
            entry.unread ? "font-medium" : "text-muted-foreground"
          )}>
            {entry.title}
          </div>
          {showContentPreview && entry.content_preview && (
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {entry.content_preview}
            </div>
          )}
          {showTags && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {/* Detected tags - italic text, clickable to promote */}
              {entry.detected_tags?.map((tag) => {
                const colors = getTagColor(tag.name)
                return (
                  <button
                    key={`detected-${tag.id}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onAddTag?.(tag.name)
                    }}
                    className="text-xs italic hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-default"
                    style={{ color: colors.bg }}
                    title={`Add "${tag.name}" tag`}
                    disabled={!onAddTag}
                  >
                    {tag.name}
                  </button>
                )
              })}
              {/* Explicit tags - pill style with rainbow colors */}
              {entry.tags?.map((tag) => {
                const colors = getTagColor(tag.name)
                return (
                  <Badge
                    key={tag.id}
                    className="text-xs px-1.5 py-0"
                    style={{ backgroundColor: colors.bg, color: colors.fg }}
                  >
                    {tag.name}
                  </Badge>
                )
              })}
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
        {/* Action buttons - larger touch targets on mobile */}
        <div className="flex items-center gap-1 sm:gap-0.5 shrink-0">
          {/* Hide score on small mobile screens */}
          <div className="hidden xs:block">
            <ScoreBadge score={entry.score} size="sm" />
          </div>
          {entry.note && (
            <span className="p-1 sm:p-0.5" aria-label="Has note">
              <StickyNote
                className="h-4 w-4"
                style={{
                  color: "var(--color-accent-secondary)",
                }}
              />
            </span>
          )}
          <button
            className="p-2 sm:p-0.5 -m-1 sm:m-0 hover:bg-background rounded min-w-[32px] sm:min-w-0"
            onClick={(e) => {
              e.stopPropagation()
              onToggleStarred()
            }}
            aria-label={entry.starred ? "Remove star" : "Add star"}
          >
            <Star
              className="h-5 w-5 sm:h-4 sm:w-4"
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
