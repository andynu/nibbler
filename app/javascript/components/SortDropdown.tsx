import { ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { SortConfig, SortColumn, SortDirection } from "@/lib/api"

interface SortDropdownProps {
  currentSort: SortConfig[]
  onSortChange: (newSort: SortConfig[]) => void
  className?: string
}

// Sort options combining column and direction
const SORT_OPTIONS: Array<{
  value: string
  column: SortColumn
  direction: SortDirection
  label: string
}> = [
  { value: "date:desc", column: "date", direction: "desc", label: "Date (newest)" },
  { value: "date:asc", column: "date", direction: "asc", label: "Date (oldest)" },
  { value: "feed:asc", column: "feed", direction: "asc", label: "Feed (A-Z)" },
  { value: "feed:desc", column: "feed", direction: "desc", label: "Feed (Z-A)" },
  { value: "score:desc", column: "score", direction: "desc", label: "Score (high)" },
  { value: "score:asc", column: "score", direction: "asc", label: "Score (low)" },
  { value: "title:asc", column: "title", direction: "asc", label: "Title (A-Z)" },
  { value: "title:desc", column: "title", direction: "desc", label: "Title (Z-A)" },
]

export function SortDropdown({
  currentSort,
  onSortChange,
  className,
}: SortDropdownProps) {
  // Get current value from first sort config (mobile only supports single sort)
  const currentValue = currentSort.length > 0
    ? `${currentSort[0].column}:${currentSort[0].direction}`
    : "date:desc"

  const handleChange = (value: string) => {
    const option = SORT_OPTIONS.find((o) => o.value === value)
    if (option) {
      onSortChange([{ column: option.column, direction: option.direction }])
    }
  }

  // Get display label for current sort
  const currentOption = SORT_OPTIONS.find((o) => o.value === currentValue)
  const displayLabel = currentOption?.label || "Sort by"

  return (
    <Select value={currentValue} onValueChange={handleChange}>
      <SelectTrigger className={className}>
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          <SelectValue placeholder="Sort by">{displayLabel}</SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <div className="flex items-center gap-2">
              {option.direction === "asc" ? (
                <ChevronUp className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              )}
              <span>{option.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
