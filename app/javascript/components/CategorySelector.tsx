import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Category } from "@/lib/api"
import { useCategoryPaths } from "@/hooks/useCategoryPaths"
import { Folder, FolderOpen, Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The deepest level a row's indentation expresses. Deeper rows share this
 * offset instead of spending the row's width on it; the ancestor path in front
 * of each title still says where the row sits.
 */
const MAX_INDENT_DEPTH = 3

interface CategorySelectorProps {
  categories: Category[]
  selectedCategoryId: number | null
  onSelect: (categoryId: number | null) => void
  placeholder?: string
  className?: string
}

export function CategorySelector({
  categories,
  selectedCategoryId,
  onSelect,
  placeholder = "Select category...",
  className,
}: CategorySelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [triggerWidth, setTriggerWidth] = useState<number | undefined>(undefined)

  // Measure trigger width to match popover width
  useEffect(() => {
    if (triggerRef.current) {
      setTriggerWidth(triggerRef.current.offsetWidth)
    }
  }, [open])

  // Reset search when popover closes
  useEffect(() => {
    if (!open) {
      setSearch("")
    }
  }, [open])

  const { categoriesWithPaths, filteredCategories } = useCategoryPaths(categories, search)

  // Get selected category display info
  const selectedCategory = useMemo(() => {
    if (selectedCategoryId === null) return null
    return categoriesWithPaths.find((c) => c.category.id === selectedCategoryId)
  }, [selectedCategoryId, categoriesWithPaths])

  const handleSelect = useCallback((categoryId: number | null) => {
    onSelect(categoryId)
    setOpen(false)
  }, [onSelect])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate">
            {selectedCategory ? selectedCategory.path.join(" / ") : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{ width: triggerWidth }}
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search categories..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No categories found.</CommandEmpty>

            {/* No category option */}
            <CommandGroup>
              <CommandItem
                onSelect={() => handleSelect(null)}
                className="flex items-center"
              >
                <FolderOpen className="mr-2 h-4 w-4 opacity-50" />
                <span className="text-muted-foreground">No category</span>
                {selectedCategoryId === null && (
                  <Check className="ml-auto h-4 w-4" />
                )}
              </CommandItem>
            </CommandGroup>

            {/* Categories list */}
            {filteredCategories.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  {filteredCategories.map((item) => {
                    const isSelected = selectedCategoryId === item.category.id
                    return (
                      <CommandItem
                        key={item.category.id}
                        value={item.category.id.toString()}
                        onSelect={() => handleSelect(item.category.id)}
                        className="flex items-center"
                      >
                        <span
                          style={{ paddingLeft: `${Math.min(item.depth, MAX_INDENT_DEPTH) * 12}px` }}
                          className="flex items-center"
                        >
                          <Folder className="mr-2 h-4 w-4" />
                          {item.depth > 0 ? (
                            <span className="text-muted-foreground text-xs mr-1">
                              {item.path.slice(0, -1).join(" / ")} /
                            </span>
                          ) : null}
                          <span>{item.category.title}</span>
                        </span>
                        {isSelected && <Check className="ml-auto h-4 w-4" />}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
