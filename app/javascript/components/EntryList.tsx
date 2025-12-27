import { useEffect, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCheck, Star, Circle } from "lucide-react"
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
  onMarkAllRead,
  isLoading,
  title,
}: EntryListProps) {
  const { preferences } = usePreferences()
  const { formatListDate } = useDateFormat()
  const showContentPreview = preferences.show_content_preview === "true"
  const unreadCount = entries.filter((e) => e.unread).length
  const listRef = useRef<HTMLDivElement>(null)

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
                  showContentPreview={showContentPreview}
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
  showContentPreview: boolean
  formatDate: (date: Date | string) => string
}

function EntryItem({ entry, isSelected, onSelect, onToggleRead, onToggleStarred, showContentPreview, formatDate }: EntryItemProps) {
  const formattedDate = formatDate(entry.published)

  return (
    <div
      data-entry-id={entry.id}
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
          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
            {entry.feed_title && <span className="truncate max-w-[120px]">{entry.feed_title}</span>}
            <span>·</span>
            <span className="whitespace-nowrap">{formattedDate}</span>
          </div>
        </div>
        <button
          className="p-0.5 hover:bg-background rounded shrink-0"
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
  )
}
