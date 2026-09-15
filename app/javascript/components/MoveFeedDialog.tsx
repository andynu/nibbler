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
import { useCategoryPaths } from "@/hooks/useCategoryPaths"
import { CategoryPathItem } from "@/components/CategoryPathItem"
import { Folder, FolderOpen, FolderPlus, Check } from "lucide-react"

interface MoveFeedDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  feed: Feed | null
  categories: Category[]
  onFeedMoved: (feed: Feed) => void
  onCategoryCreated: (category: Category) => void
}

/**
 * The deepest level a row's indentation expresses. Deeper rows share this
 * offset instead of spending the row's width on it; the ancestor path in front
 * of each title still says where the row sits.
 */
const MAX_INDENT_DEPTH = 3

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

  const { categoriesWithPaths, filteredCategories } = useCategoryPaths(categories, search)

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

          {/* Categories - show first so they get focus priority when typing */}
          {filteredCategories.length > 0 && (
            <CommandGroup heading="Categories">
              {filteredCategories.map((item) => {
                const isCurrentCategory = feed.category_id === item.category.id
                return (
                  <CategoryPathItem
                    key={item.category.id}
                    item={item}
                    maxIndentDepth={MAX_INDENT_DEPTH}
                    checked={isCurrentCategory}
                    onSelect={() => handleSelectCategory(item.category.id)}
                    disabled={isCurrentCategory}
                  />
                )
              })}
            </CommandGroup>
          )}

          {/* Actions - at bottom so create category is last option */}
          <CommandSeparator />
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
