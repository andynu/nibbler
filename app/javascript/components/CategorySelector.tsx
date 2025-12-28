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
import { Folder, FolderOpen, Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface CategoryWithPath {
  category: Category
  path: string[]
  depth: number
}

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

  // Build category hierarchy with paths
  const categoriesWithPaths = useMemo(() => {
    const result: CategoryWithPath[] = []
    const categoryMap = new Map(categories.map((c) => [c.id, c]))

    // Build path for each category
    const getPath = (cat: Category): string[] => {
      const path: string[] = []
      let current: Category | undefined = cat
      while (current) {
        path.unshift(current.title)
        current = current.parent_id ? categoryMap.get(current.parent_id) : undefined
      }
      return path
    }

    // Calculate depth for each category
    const getDepth = (cat: Category): number => {
      let depth = 0
      let current: Category | undefined = cat
      while (current?.parent_id) {
        depth++
        current = categoryMap.get(current.parent_id)
      }
      return depth
    }

    // Sort categories by path for hierarchical display
    const sortedCategories = [...categories].sort((a, b) => {
      const pathA = getPath(a).join("/")
      const pathB = getPath(b).join("/")
      return pathA.localeCompare(pathB)
    })

    sortedCategories.forEach((cat) => {
      result.push({
        category: cat,
        path: getPath(cat),
        depth: getDepth(cat),
      })
    })

    return result
  }, [categories])

  // Filter categories based on search
  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categoriesWithPaths

    const searchLower = search.toLowerCase()
    return categoriesWithPaths.filter((item) =>
      item.category.title.toLowerCase().includes(searchLower) ||
      item.path.some((p) => p.toLowerCase().includes(searchLower))
    )
  }, [categoriesWithPaths, search])

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
                          style={{ paddingLeft: `${item.depth * 12}px` }}
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
