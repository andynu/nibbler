import { useState, useMemo, useCallback, useEffect } from "react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Feed, Category, api } from "@/lib/api"
import { Folder, FolderOpen, FolderPlus, Check } from "lucide-react"

interface MoveFeedDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  feed: Feed | null
  categories: Category[]
  onFeedMoved: (feed: Feed) => void
  onCategoryCreated: (category: Category) => void
}

interface CategoryWithPath {
  category: Category
  path: string[]
  depth: number
}

export function MoveFeedDialog({
  open,
  onOpenChange,
  feed,
  categories,
  onFeedMoved,
  onCategoryCreated,
}: MoveFeedDialogProps) {
  const [search, setSearch] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  // Reset search when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setSearch("")
      setIsCreating(false)
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

  const handleSelectCategory = useCallback(async (categoryId: number | null) => {
    if (!feed) return

    try {
      const updatedFeed = await api.feeds.update(feed.id, {
        feed: { category_id: categoryId },
      })
      onFeedMoved(updatedFeed)
      onOpenChange(false)
    } catch (error) {
      console.error("Failed to move feed:", error)
    }
  }, [feed, onFeedMoved, onOpenChange])

  const handleCreateCategory = useCallback(async () => {
    if (!feed || !search.trim()) return

    setIsCreating(true)
    try {
      // Create new category
      const newCategory = await api.categories.create({
        category: { title: search.trim() },
      })
      onCategoryCreated(newCategory)

      // Move feed to new category
      const updatedFeed = await api.feeds.update(feed.id, {
        feed: { category_id: newCategory.id },
      })
      onFeedMoved(updatedFeed)
      onOpenChange(false)
    } catch (error) {
      console.error("Failed to create category:", error)
    } finally {
      setIsCreating(false)
    }
  }, [feed, search, onCategoryCreated, onFeedMoved, onOpenChange])

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.shiftKey && search.trim()) {
      e.preventDefault()
      handleCreateCategory()
    }
  }, [search, handleCreateCategory])

  const currentCategoryPath = useMemo(() => {
    if (!feed?.category_id) return null
    const item = categoriesWithPaths.find((c) => c.category.id === feed.category_id)
    return item ? item.path.join(" / ") : null
  }, [feed?.category_id, categoriesWithPaths])

  if (!feed) return null

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <div onKeyDown={handleKeyDown}>
        <CommandInput
          placeholder="Search categories or type to create..."
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>
            {search.trim() ? (
              <div className="py-2 text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  No matching categories
                </p>
                <p className="text-xs text-muted-foreground">
                  Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Shift+Enter</kbd> to create "{search}"
                </p>
              </div>
            ) : (
              "No categories"
            )}
          </CommandEmpty>

          {/* Current location */}
          {currentCategoryPath && (
            <>
              <CommandGroup heading="Current Location">
                <CommandItem disabled className="opacity-60">
                  <Folder className="mr-2 h-4 w-4" />
                  {currentCategoryPath}
                  <Check className="ml-auto h-4 w-4" />
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {/* Uncategorized option */}
          <CommandGroup heading="Actions">
            <CommandItem
              onSelect={() => handleSelectCategory(null)}
              disabled={feed.category_id === null}
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              Remove from category (Uncategorized)
            </CommandItem>
            {search.trim() && (
              <CommandItem onSelect={handleCreateCategory} disabled={isCreating}>
                <FolderPlus className="mr-2 h-4 w-4" />
                Create "{search}" and move here
                <span className="ml-auto text-xs text-muted-foreground">
                  Shift+Enter
                </span>
              </CommandItem>
            )}
          </CommandGroup>

          {/* Categories */}
          {filteredCategories.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Categories">
                {filteredCategories.map((item) => {
                  const isCurrentCategory = feed.category_id === item.category.id
                  return (
                    <CommandItem
                      key={item.category.id}
                      onSelect={() => handleSelectCategory(item.category.id)}
                      disabled={isCurrentCategory}
                      className="flex items-center"
                    >
                      <span style={{ paddingLeft: `${item.depth * 12}px` }} className="flex items-center">
                        <Folder className="mr-2 h-4 w-4" />
                        {item.depth > 0 ? (
                          <span className="text-muted-foreground text-xs mr-1">
                            {item.path.slice(0, -1).join(" / ")} /
                          </span>
                        ) : null}
                        <span>{item.category.title}</span>
                      </span>
                      {isCurrentCategory && <Check className="ml-auto h-4 w-4" />}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </div>
    </CommandDialog>
  )
}

// Hook to trigger move feed dialog with keyboard shortcut
export function useMoveFeedDialog() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Ctrl+M to open move feed dialog
      if (e.key === "m" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault()
        setOpen(true)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return { open, setOpen }
}
