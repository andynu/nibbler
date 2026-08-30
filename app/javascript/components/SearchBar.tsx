import { forwardRef } from "react"
import type { KeyboardEvent } from "react"
import { Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SearchScopeControls } from "@/components/SearchScopeControls"
import type { SearchScopeControl } from "@/components/SearchScopeControls"

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  /**
   * Escape on a non-empty box and the clear button. Distinct from
   * `onChange("")` so that emptying the box deliberately can also put the
   * scope back, while backspacing to empty leaves a widened scope alone.
   * Falls back to `onChange("")` when the caller has no scope to reset.
   */
  onClear?: () => void
  /**
   * Called when Escape arrives on an already-empty box. `useKeyboardCommands`
   * drops every key whose target is an input, so Escape can only reach the
   * close-entry command if the box hands it back deliberately.
   */
  onDismiss?: () => void
  /** Shown while a request is in flight, next to the magnifier. */
  isSearching?: boolean
  /**
   * The scope pills, shown under the input once there is a query. Omitted
   * entirely by callers that have no scope to offer.
   */
  scope?: SearchScopeControl
  placeholder?: string
  className?: string
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  function SearchBar(
    {
      value,
      onChange,
      onClear,
      onDismiss,
      isSearching,
      scope,
      placeholder = "Search articles",
      className,
    },
    ref
  ) {
    const clear = () => (onClear ? onClear() : onChange(""))

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      // The scope shortcuts have to live here rather than in the shared
      // catalog: `useKeyboardCommands` ignores every key whose target is an
      // input, and the whole point is reaching them without leaving the box.
      // Matched on `event.code`, because Alt+A on a Mac layout arrives as "å".
      if (event.altKey && !event.ctrlKey && !event.metaKey && scope) {
        if (event.code === "KeyA" && scope.placeLabel) {
          event.preventDefault()
          scope.onPlaceChange(scope.place === "list" ? "everything" : "list")
          return
        }
        if (event.code === "KeyH" && scope.historyLabel) {
          event.preventDefault()
          scope.onHistoryChange(scope.history === "list" ? "all" : "list")
          return
        }
      }

      if (event.key !== "Escape") return

      if (value !== "") {
        // Swallow it. Escape also closes the open entry, and someone emptying
        // the search box has not asked to lose their place in the reader.
        event.preventDefault()
        event.stopPropagation()
        clear()
        return
      }

      // Nothing left to clear, so give the key up: blur first, so the
      // document-level handler sees a non-input target next time round.
      event.currentTarget.blur()
      onDismiss?.()
    }

    return (
      <div
        className={cn(
          "px-2 py-1.5 border-b border-border shrink-0 bg-muted/20",
          className
        )}
      >
        <div className="relative flex items-center">
          <Search
            className={cn(
              "absolute left-2 h-3.5 w-3.5 pointer-events-none",
              isSearching ? "text-primary animate-pulse" : "text-muted-foreground"
            )}
            aria-hidden="true"
          />
          <input
            ref={ref}
            type="search"
            role="searchbox"
            aria-label="Search articles"
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            className={cn(
              "w-full h-7 pl-7 pr-7 text-xs rounded-md border border-border bg-background",
              "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary",
              // Safari draws its own clear affordance on type=search; ours is
              // the button below, and two of them look broken.
              "[&::-webkit-search-cancel-button]:appearance-none"
            )}
          />
          {value !== "" && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={clear}
              className="absolute right-1 p-0.5 rounded hover:bg-accent text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {/* Only once there is a query: an idle box has no result set whose
            scope needs describing, and the pills would just be chrome. */}
        {scope && value !== "" && <SearchScopeControls {...scope} />}
      </div>
    )
  }
)
