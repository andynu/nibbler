import { Circle, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { highlightHeadline, highlightTerms } from "@/lib/searchHighlight"
import type { SearchResult } from "@/lib/api"

interface SearchResultListProps {
  results: SearchResult[]
  query: string
  isSearching: boolean
  error: string | null
  selectedEntryId: number | null
  onSelectResult: (userEntryId: number) => void
  formatDate: (date: Date | string) => string
  /**
   * The scope that produced these results, named: "Ruby Weekly, unread". Null
   * when nothing narrowed the search. Built from the scope actually sent, not
   * from the list's heading, so it cannot blame a filter the request did not
   * carry.
   */
  scopeLabel?: string | null
  /**
   * Matches the same query has with every filter dropped. Rendered as a way
   * out of an empty result set; null when unknown or not worth offering.
   */
  widerMatchCount?: number | null
  /** Drops every scope filter and re-runs the query. Required for the offer to render. */
  onWiden?: () => void
}

/**
 * Search hits, rendered as their own row rather than through EntryItem: a
 * SearchResult has no score, note, tags or published flag, so the entry row's
 * controls would all be dead here.
 */
export function SearchResultList({
  results,
  query,
  isSearching,
  error,
  selectedEntryId,
  onSelectResult,
  formatDate,
  scopeLabel = null,
  widerMatchCount = null,
  onWiden,
}: SearchResultListProps) {
  if (error) {
    return (
      <div className="p-4 text-center text-sm text-destructive">
        Search failed: {error}
      </div>
    )
  }

  if (isSearching && results.length === 0) {
    return (
      <div
        role="status"
        aria-label="Searching"
        className="p-4 text-center text-muted-foreground"
      >
        Searching...
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p className="text-sm">
          No matches for "{query}" in {scopeLabel || "all articles"}
        </p>
        {/* Widening is only discoverable if the reader is told there is
            something to widen into. Without the count this reads as a dead end
            and the query gets retyped somewhere else (ttrb-prmg). */}
        {onWiden && widerMatchCount !== null && widerMatchCount > 0 && (
          <button
            type="button"
            onClick={onWiden}
            className="mt-2 text-xs underline underline-offset-2 hover:text-foreground"
          >
            {widerMatchCount === 1
              ? "1 match in all articles"
              : `${widerMatchCount} matches in all articles`}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="p-1" role="listbox" aria-label="Search results">
      {results.map((result) => (
        <div
          key={result.id}
          data-entry-id={result.id}
          role="option"
          aria-selected={selectedEntryId === result.id}
          className={cn(
            "p-2 rounded-md cursor-pointer hover:bg-accent/50 transition-colors",
            selectedEntryId === result.id && "bg-accent",
            result.unread && "border-l-2"
          )}
          style={result.unread ? { borderLeftColor: "var(--color-accent-secondary)" } : undefined}
          onClick={() => onSelectResult(result.id)}
        >
          <div className="flex items-start gap-2">
            <Circle
              className="h-3 w-3 mt-1 shrink-0"
              aria-hidden="true"
              style={
                result.unread
                  ? {
                      fill: "var(--color-accent-secondary)",
                      color: "var(--color-accent-secondary)",
                    }
                  : undefined
              }
            />
            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  "text-sm leading-snug line-clamp-2",
                  result.unread ? "font-medium" : "text-muted-foreground"
                )}
              >
                {highlightTerms(result.title, query)}
              </div>
              {result.snippet && (
                <div className="mt-0.5 text-xs leading-snug text-muted-foreground line-clamp-2">
                  {highlightHeadline(result.snippet)}
                </div>
              )}
              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                {result.feed_title && (
                  <>
                    <span className="truncate max-w-[120px]">{result.feed_title}</span>
                    <span>·</span>
                  </>
                )}
                <span className="whitespace-nowrap">{formatDate(result.published)}</span>
              </div>
            </div>
            {result.starred && (
              <Star
                className="h-4 w-4 shrink-0"
                aria-label="Starred"
                style={{
                  fill: "var(--color-accent-secondary)",
                  color: "var(--color-accent-secondary)",
                }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
