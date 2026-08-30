import { ChevronUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SortConfig, SortColumn, SortDirection } from "@/lib/api"

interface SortableColumnHeaderProps {
  column: SortColumn
  label: string
  currentSort: SortConfig[]
  onSort: (column: SortColumn, additive: boolean) => void
  className?: string
}

export function SortableColumnHeader({
  column,
  label,
  currentSort,
  onSort,
  className,
}: SortableColumnHeaderProps) {
  const sortIndex = currentSort.findIndex((s) => s.column === column)
  const isActive = sortIndex !== -1
  const direction = isActive ? currentSort[sortIndex].direction : null
  const priority = isActive ? sortIndex + 1 : null
  const showPriority = currentSort.length > 1 && priority !== null

  const handleClick = (e: React.MouseEvent) => {
    onSort(column, e.shiftKey)
  }

  return (
    <button
      className={cn(
        "flex items-center gap-0.5 px-1.5 py-1 text-xs font-medium rounded transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        isActive && "text-primary",
        className
      )}
      onClick={handleClick}
      title={`Click to sort by ${label}. Shift+click to add as secondary sort.`}
    >
      <span>{label}</span>
      {isActive && (
        <span className="flex items-center">
          {direction === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          {showPriority && (
            <span className="text-[10px] -ml-0.5 -mt-1">{priority}</span>
          )}
        </span>
      )}
    </button>
  )
}

interface SortableHeaderRowProps {
  currentSort: SortConfig[]
  onSort: (column: SortColumn, additive: boolean) => void
  columns?: ReadonlyArray<{ column: SortColumn; label: string }>
  className?: string
}

// What the entry list can be ordered by.
export const ENTRY_SORT_COLUMNS: ReadonlyArray<{ column: SortColumn; label: string }> = [
  { column: "date", label: "Date" },
  { column: "feed", label: "Feed" },
  { column: "title", label: "Title" },
  { column: "score", label: "Score" },
]

/**
 * What a search can be ordered by. Relevance leads because it is the answer to
 * the question the reader just typed, and it is the one column the entry list
 * cannot offer.
 *
 * Score is absent: a search hit carries no score and the result row draws none,
 * so ordering by it would rearrange the list around a value nobody can see.
 */
export const SEARCH_SORT_COLUMNS: ReadonlyArray<{ column: SortColumn; label: string }> = [
  { column: "relevance", label: "Relevance" },
  { column: "date", label: "Date" },
  { column: "feed", label: "Feed" },
  { column: "title", label: "Title" },
]

/**
 * Columns whose ascending direction has no reading anyone would ask for.
 * Relevance ascending is "worst match first", so the Relevance header selects
 * rather than toggles.
 */
const DESC_ONLY_COLUMNS: readonly SortColumn[] = [ "relevance" ]

export function SortableHeaderRow({
  currentSort,
  onSort,
  columns = ENTRY_SORT_COLUMNS,
  className,
}: SortableHeaderRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 py-1 border-b border-border bg-muted/20",
        className
      )}
    >
      <span className="text-xs text-muted-foreground mr-1">Sort:</span>
      {columns.map(({ column, label }) => (
        <SortableColumnHeader
          key={column}
          column={column}
          label={label}
          currentSort={currentSort}
          onSort={onSort}
        />
      ))}
    </div>
  )
}

// Helper to handle sort toggling logic
export function toggleSort(
  currentSort: SortConfig[],
  column: SortColumn,
  additive: boolean
): SortConfig[] {
  const existingIndex = currentSort.findIndex((s) => s.column === column)
  // A desc-only column has one step fewer: it goes selected -> gone, with no
  // ascending state in between.
  const canAscend = !DESC_ONLY_COLUMNS.includes(column)

  if (additive) {
    // Shift+click: toggle this column in multi-sort mode
    if (existingIndex !== -1) {
      // Column exists - toggle direction or remove if clicking third time
      const existing = currentSort[existingIndex]
      if (existing.direction === "desc" && canAscend) {
        // desc -> asc
        return [
          ...currentSort.slice(0, existingIndex),
          { column, direction: "asc" as SortDirection },
          ...currentSort.slice(existingIndex + 1),
        ]
      } else {
        // asc -> remove
        return [
          ...currentSort.slice(0, existingIndex),
          ...currentSort.slice(existingIndex + 1),
        ]
      }
    } else {
      // Add as new column (default desc)
      return [...currentSort, { column, direction: "desc" as SortDirection }]
    }
  } else {
    // Regular click: replace all sorts with this column
    if (existingIndex !== -1 && currentSort.length === 1) {
      // Already the only sort - toggle direction
      const existing = currentSort[0]
      if (existing.direction === "desc" && canAscend) {
        return [{ column, direction: "asc" as SortDirection }]
      } else {
        // Clicking third time returns to desc
        return [{ column, direction: "desc" as SortDirection }]
      }
    } else {
      // Replace with this column, default desc
      return [{ column, direction: "desc" as SortDirection }]
    }
  }
}
