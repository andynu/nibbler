import { cn } from "@/lib/utils"
import type { SearchHistory, SearchPlace } from "@/hooks/useEntrySearch"

export interface SearchScopeControl {
  place: SearchPlace
  history: SearchHistory
  onPlaceChange: (place: SearchPlace) => void
  onHistoryChange: (history: SearchHistory) => void
  /**
   * What the list narrows to by place, named: a feed or category title, a tag,
   * or a place view. Null when the list narrows nothing by place, which is when
   * there is no widening to offer and the control does not render.
   */
  placeLabel: string | null
  /**
   * The read-state window the list imposes: "Fresh", "Unread", "Read". Null
   * when it imposes none.
   */
  historyLabel: string | null
}

/**
 * The two escapes from the list a search inherited, one pill each.
 *
 * Each pill names the scope in effect rather than the action it performs, so
 * the row reads as a description of the result set ("Fresh · Unread") and not
 * as a pair of commands. That means the visible text changes when the pill is
 * pressed, which is why these are cycle buttons and not `aria-pressed` toggles:
 * a toggle's accessible name has to stay put while its state moves, and here
 * the name IS the state. The `title` carries the action.
 *
 * A pill is rendered only when its axis has something to widen. In Fresh the
 * list narrows nothing by place, so offering "All feeds" there would be a
 * control that cannot change the answer.
 */
export function SearchScopeControls({
  place,
  history,
  onPlaceChange,
  onHistoryChange,
  placeLabel,
  historyLabel,
}: SearchScopeControl) {
  if (!placeLabel && !historyLabel) return null

  return (
    <div
      role="group"
      aria-label="Search scope"
      className="flex items-center gap-1 mt-1 text-[11px]"
    >
      <span className="text-muted-foreground shrink-0">in</span>
      {placeLabel && (
        <ScopePill
          narrowed={place === "list"}
          label={place === "list" ? placeLabel : "All feeds"}
          title={
            place === "list"
              ? "Search all feeds instead (Alt+A)"
              : `Search only ${placeLabel} (Alt+A)`
          }
          onClick={() => onPlaceChange(place === "list" ? "everything" : "list")}
        />
      )}
      {historyLabel && (
        <ScopePill
          narrowed={history === "list"}
          label={history === "list" ? historyLabel : "All history"}
          title={
            history === "list"
              ? "Search read and archived articles too (Alt+H)"
              : `Search only ${historyLabel.toLowerCase()} articles (Alt+H)`
          }
          onClick={() => onHistoryChange(history === "list" ? "all" : "list")}
        />
      )}
    </div>
  )
}

function ScopePill({
  narrowed,
  label,
  title,
  onClick,
}: {
  narrowed: boolean
  label: string
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "px-1.5 py-0.5 rounded-full border max-w-[45%] truncate",
        "focus:outline-none focus:ring-1 focus:ring-primary",
        narrowed
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-dashed border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  )
}
