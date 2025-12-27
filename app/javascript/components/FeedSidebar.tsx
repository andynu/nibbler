import { useState, useEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Rss, Folder, FolderOpen, ChevronRight, ChevronDown, RefreshCw, Star, Clock, Send, Plus, MoreHorizontal, Settings, AlertCircle, Cog, FolderPlus, Pencil, Trash2, Eye, EyeOff, ArrowUpDown } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import type { Feed, Category } from "@/lib/api"
import { CategoryDialog } from "@/components/CategoryDialog"
import { usePreferences } from "@/contexts/PreferencesContext"

type VirtualFeed = "starred" | "fresh" | "published" | null

interface FeedSidebarProps {
  feeds: Feed[]
  categories: Category[]
  selectedFeedId: number | null
  selectedCategoryId: number | null
  virtualFeed: VirtualFeed
  onSelectFeed: (feedId: number | null) => void
  onSelectCategory: (categoryId: number | null) => void
  onSelectVirtualFeed: (feed: VirtualFeed) => void
  onRefreshAll: () => void
  isRefreshing: boolean
  onSubscribe: () => void
  onEditFeed: (feed: Feed) => void
  onSettings: () => void
  onCategoriesChange: (categories: Category[]) => void
}

export function FeedSidebar({
  feeds,
  categories,
  selectedFeedId,
  selectedCategoryId,
  virtualFeed,
  onSelectFeed,
  onSelectCategory,
  onSelectVirtualFeed,
  onRefreshAll,
  isRefreshing,
  onSubscribe,
  onEditFeed,
  onSettings,
  onCategoriesChange,
}: FeedSidebarProps) {
  const { preferences, updatePreference } = usePreferences()
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(
    new Set(categories.map((c) => c.id))
  )
  const [showCategoryDialog, setShowCategoryDialog] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)

  // Local override for hide read feeds (toggle in UI)
  const [hideReadOverride, setHideReadOverride] = useState<boolean | null>(null)
  const hideReadFeeds = hideReadOverride ?? preferences.hide_read_feeds === "true"
  const sortByUnread = preferences.feeds_sort_by_unread === "true"

  useEffect(() => {
    setExpandedCategories(new Set(categories.map((c) => c.id)))
  }, [categories])

  // Helper to filter and sort feeds
  const filterAndSortFeeds = (feedList: Feed[]): Feed[] => {
    let filtered = feedList
    if (hideReadFeeds) {
      filtered = filtered.filter((f) => f.unread_count > 0)
    }
    if (sortByUnread) {
      return [...filtered].sort((a, b) => b.unread_count - a.unread_count)
    }
    return filtered
  }

  const toggleHideRead = () => {
    const newValue = !hideReadFeeds
    setHideReadOverride(newValue)
    // Persist to preference
    updatePreference("hide_read_feeds", newValue ? "true" : "false")
  }

  const toggleSortByUnread = () => {
    updatePreference("feeds_sort_by_unread", sortByUnread ? "false" : "true")
  }

  const toggleCategory = (categoryId: number) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  const uncategorizedFeeds = filterAndSortFeeds(feeds.filter((f) => !f.category_id))
  const totalUnread = feeds.reduce((sum, f) => sum + f.unread_count, 0)
  const feedsWithErrors = feeds.filter((f) => f.last_error)

  const handleCategoryCreated = (category: Category) => {
    onCategoriesChange([...categories, category])
  }

  const handleCategoryUpdated = (updated: Category) => {
    onCategoriesChange(categories.map((c) => (c.id === updated.id ? updated : c)))
    setEditingCategory(null)
  }

  const handleDeleteCategory = async (category: Category) => {
    const feedCount = feeds.filter((f) => f.category_id === category.id).length
    const msg = feedCount > 0
      ? `Delete "${category.title}"? Its ${feedCount} feed(s) will become uncategorized.`
      : `Delete "${category.title}"?`

    if (!confirm(msg)) return

    try {
      await api.categories.delete(category.id)
      onCategoriesChange(categories.filter((c) => c.id !== category.id))
      if (selectedCategoryId === category.id) {
        onSelectCategory(null)
      }
    } catch (error) {
      console.error("Failed to delete category:", error)
    }
  }

  return (
    <div className="h-full flex flex-col border-r border-border bg-muted/30">
      <div className="h-12 px-3 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Rss className="h-5 w-5" />
          <span className="font-semibold">TTRB</span>
        </div>
        <div className="flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Add...">
                <Plus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onSubscribe}>
                <Rss className="mr-2 h-4 w-4" />
                Subscribe to Feed
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowCategoryDialog(true)}>
                <FolderPlus className="mr-2 h-4 w-4" />
                New Category
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleHideRead}
            title={hideReadFeeds ? "Show all feeds" : "Hide read feeds"}
          >
            {hideReadFeeds ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", sortByUnread && "text-primary")}
            onClick={toggleSortByUnread}
            title={sortByUnread ? "Sort alphabetically" : "Sort by unread count"}
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onRefreshAll}
            disabled={isRefreshing}
            title="Refresh all feeds"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onSettings} title="Settings">
            <Cog className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 mb-1"
            style={!selectedFeedId && !selectedCategoryId && !virtualFeed ? {
              backgroundColor: "var(--color-accent-primary)",
              color: "white",
            } : undefined}
            onClick={() => {
              onSelectFeed(null)
              onSelectCategory(null)
              onSelectVirtualFeed(null)
            }}
          >
            <Rss className="h-4 w-4" />
            <span className="flex-1 text-left">All Feeds</span>
            {totalUnread > 0 && <Badge variant="secondary">{totalUnread}</Badge>}
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-2 mb-1"
            style={virtualFeed === "fresh" ? {
              backgroundColor: "var(--color-accent-primary)",
              color: "white",
            } : undefined}
            onClick={() => onSelectVirtualFeed("fresh")}
          >
            <Clock className="h-4 w-4" />
            <span className="flex-1 text-left">Fresh</span>
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-2 mb-1"
            style={virtualFeed === "starred" ? {
              backgroundColor: "var(--color-accent-primary)",
              color: "white",
            } : undefined}
            onClick={() => onSelectVirtualFeed("starred")}
          >
            <Star className="h-4 w-4" style={{ color: "var(--color-accent-secondary)" }} />
            <span className="flex-1 text-left">Starred</span>
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-2 mb-1"
            style={virtualFeed === "published" ? {
              backgroundColor: "var(--color-accent-primary)",
              color: "white",
            } : undefined}
            onClick={() => onSelectVirtualFeed("published")}
          >
            <Send className="h-4 w-4" />
            <span className="flex-1 text-left">Published</span>
          </Button>

          {feedsWithErrors.length > 0 && (
            <>
              <div className="h-px bg-border my-2" />
              <div className="mb-2">
                <div className="flex items-center gap-2 px-3 py-1.5 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>{feedsWithErrors.length} feed{feedsWithErrors.length !== 1 ? 's' : ''} with errors</span>
                </div>
                <div className="space-y-0.5">
                  {feedsWithErrors.map((feed) => (
                    <Button
                      key={feed.id}
                      variant="ghost"
                      className="w-full justify-start gap-2 h-7 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => onEditFeed(feed)}
                    >
                      {feed.icon_url ? (
                        <img src={feed.icon_url} className="h-3 w-3" alt="" />
                      ) : (
                        <Rss className="h-3 w-3" />
                      )}
                      <span className="flex-1 text-left truncate">{feed.title}</span>
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="h-px bg-border my-2" />

          {categories.map((category) => {
            const categoryFeeds = filterAndSortFeeds(
              feeds.filter((f) => f.category_id === category.id)
            )
            // Hide empty categories when hiding read feeds
            if (hideReadFeeds && categoryFeeds.length === 0) return null
            return (
              <CategoryItem
                key={category.id}
                category={category}
                feeds={categoryFeeds}
                isExpanded={expandedCategories.has(category.id)}
                selectedFeedId={selectedFeedId}
                selectedCategoryId={selectedCategoryId}
                onToggle={() => toggleCategory(category.id)}
                onSelectFeed={onSelectFeed}
                onSelectCategory={onSelectCategory}
                onEditFeed={onEditFeed}
                onEditCategory={setEditingCategory}
                onDeleteCategory={handleDeleteCategory}
              />
            )
          })}

          {uncategorizedFeeds.length > 0 && (
            <>
              <div className="h-px bg-border my-2" />
              {uncategorizedFeeds.map((feed) => (
                <FeedItem
                  key={feed.id}
                  feed={feed}
                  isSelected={selectedFeedId === feed.id}
                  onSelect={() => onSelectFeed(feed.id)}
                  onEdit={() => onEditFeed(feed)}
                />
              ))}
            </>
          )}
        </div>
      </ScrollArea>

      <CategoryDialog
        open={showCategoryDialog || editingCategory !== null}
        onOpenChange={(open) => {
          if (!open) {
            setShowCategoryDialog(false)
            setEditingCategory(null)
          }
        }}
        category={editingCategory}
        categories={categories}
        onCategoryCreated={handleCategoryCreated}
        onCategoryUpdated={handleCategoryUpdated}
      />
    </div>
  )
}

interface CategoryItemProps {
  category: Category
  feeds: Feed[]
  isExpanded: boolean
  selectedFeedId: number | null
  selectedCategoryId: number | null
  onToggle: () => void
  onSelectFeed: (feedId: number | null) => void
  onSelectCategory: (categoryId: number | null) => void
  onEditFeed: (feed: Feed) => void
  onEditCategory: (category: Category) => void
  onDeleteCategory: (category: Category) => void
}

function CategoryItem({
  category,
  feeds,
  isExpanded,
  selectedFeedId,
  selectedCategoryId,
  onToggle,
  onSelectFeed,
  onSelectCategory,
  onEditFeed,
  onEditCategory,
  onDeleteCategory,
}: CategoryItemProps) {
  const unreadCount = feeds.reduce((sum, f) => sum + f.unread_count, 0)
  const hasSelectedChild = selectedFeedId !== null && feeds.some((f) => f.id === selectedFeedId)
  const isSelected = selectedCategoryId === category.id

  // Determine button style based on selection state
  const getButtonStyle = () => {
    if (isSelected) {
      return {
        backgroundColor: "var(--color-accent-primary)",
        color: "white",
      }
    }
    if (hasSelectedChild) {
      return {
        backgroundColor: "var(--color-accent-primary-light)",
        color: "var(--color-accent-primary-dark)",
      }
    }
    return undefined
  }

  return (
    <div className="group/category">
      <div className="flex items-center">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onToggle}>
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          className="flex-1 justify-start gap-2 h-8"
          style={getButtonStyle()}
          onClick={() => onSelectCategory(category.id)}
        >
          {isExpanded ? (
            <FolderOpen className="h-4 w-4" />
          ) : (
            <Folder className="h-4 w-4" />
          )}
          <span className="flex-1 text-left truncate">{category.title}</span>
          {unreadCount > 0 && <Badge variant="secondary">{unreadCount}</Badge>}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover/category:opacity-100 shrink-0"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEditCategory(category)}>
              <Pencil className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDeleteCategory(category)}
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {isExpanded && (
        <div className="ml-6">
          {feeds.map((feed) => (
            <FeedItem
              key={feed.id}
              feed={feed}
              isSelected={selectedFeedId === feed.id}
              onSelect={() => onSelectFeed(feed.id)}
              onEdit={() => onEditFeed(feed)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface FeedItemProps {
  feed: Feed
  isSelected: boolean
  onSelect: () => void
  onEdit: () => void
}

function FeedItem({ feed, isSelected, onSelect, onEdit }: FeedItemProps) {
  return (
    <div className="group flex items-center">
      <Button
        variant="ghost"
        className="flex-1 justify-start gap-2 h-8"
        style={isSelected ? {
          backgroundColor: "var(--color-accent-primary)",
          color: "white",
        } : undefined}
        onClick={onSelect}
      >
        {feed.icon_url ? (
          <img src={feed.icon_url} className="h-4 w-4" alt="" />
        ) : (
          <Rss className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="flex-1 text-left truncate">{feed.title}</span>
        {feed.last_error && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertCircle className="h-3 w-3 text-destructive shrink-0 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="font-medium">Update Error</p>
                <p className="text-xs opacity-90">{feed.last_error}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {feed.unread_count > 0 && <Badge variant="secondary">{feed.unread_count}</Badge>}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Settings className="mr-2 h-4 w-4" />
            Edit Feed
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
