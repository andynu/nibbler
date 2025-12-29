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
  className?: string
}

// Column definitions with labels
const SORTABLE_COLUMNS: Array<{ column: SortColumn; label: string }> = [
  { column: "date", label: "Date" },
  { column: "feed", label: "Feed" },
  { column: "title", label: "Title" },
  { column: "score", label: "Score" },
]

export function SortableHeaderRow({
  currentSort,
  onSort,
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
      {SORTABLE_COLUMNS.map(({ column, label }) => (
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

  if (additive) {
    // Shift+click: toggle this column in multi-sort mode
    if (existingIndex !== -1) {
      // Column exists - toggle direction or remove if clicking third time
      const existing = currentSort[existingIndex]
      if (existing.direction === "desc") {
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
      if (existing.direction === "desc") {
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
