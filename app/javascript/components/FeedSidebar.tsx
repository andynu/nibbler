import { useState, useEffect, useMemo } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useTheme } from "@/contexts/ThemeContext"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Rss, Folder, FolderOpen, RefreshCw, Star, Clock, Send, Plus, MoreHorizontal, Settings, AlertCircle, Cog, FolderPlus, Pencil, Trash2, Eye, EyeOff, ArrowUpDown, PanelLeftClose, PanelLeft, ChevronsUpDown, ChevronsDownUp } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn, categorizeError, ERROR_CATEGORIES, ErrorCategory } from "@/lib/utils"
import { NibblerLogo } from "@/components/NibblerLogo"
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
  onFeedsChange: (feeds: Feed[]) => void
  onFeedUpdated?: (feed: Feed) => void
  isCollapsed: boolean
  onToggleCollapse: () => void
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
  onFeedsChange,
  onFeedUpdated,
  isCollapsed,
  onToggleCollapse,
}: FeedSidebarProps) {
  const { preferences, updatePreference } = usePreferences()

  // Initialize expanded state from localStorage, defaulting to all expanded
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem("nibbler:expandedCategories")
      if (saved) {
        return new Set(JSON.parse(saved) as number[])
      }
    } catch {}
    return new Set(categories.map((c) => c.id))
  })

  const [showCategoryDialog, setShowCategoryDialog] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [refreshingFeedId, setRefreshingFeedId] = useState<number | null>(null)

  const [errorsExpanded, setErrorsExpanded] = useState(() => {
    try {
      return localStorage.getItem("nibbler:errorsExpanded") === "true"
    } catch {}
    return false
  })

  // Track which error categories are expanded
  const [expandedErrorCategories, setExpandedErrorCategories] = useState<Set<ErrorCategory>>(() => {
    try {
      const saved = localStorage.getItem("nibbler:expandedErrorCategories")
      if (saved) {
        return new Set(JSON.parse(saved) as ErrorCategory[])
      }
    } catch {}
    return new Set()
  })

  // Local override for hide read feeds (toggle in UI)
  const [hideReadOverride, setHideReadOverride] = useState<boolean | null>(null)
  const hideReadFeeds = hideReadOverride ?? preferences.hide_read_feeds === "true"
  const sortByUnread = preferences.feeds_sort_by_unread === "true"

  // Persist expanded categories to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("nibbler:expandedCategories", JSON.stringify([...expandedCategories]))
    } catch {}
  }, [expandedCategories])

  // Persist errors expanded state
  useEffect(() => {
    try {
      localStorage.setItem("nibbler:errorsExpanded", errorsExpanded ? "true" : "false")
    } catch {}
  }, [errorsExpanded])

  // Persist expanded error categories
  useEffect(() => {
    try {
      localStorage.setItem("nibbler:expandedErrorCategories", JSON.stringify([...expandedErrorCategories]))
    } catch {}
  }, [expandedErrorCategories])

  // When new categories are added, default them to expanded
  useEffect(() => {
    const currentIds = new Set(categories.map((c) => c.id))
    const newCategoryIds = categories.filter((c) => !expandedCategories.has(c.id)).map((c) => c.id)
    if (newCategoryIds.length > 0) {
      setExpandedCategories((prev) => {
        const next = new Set(prev)
        newCategoryIds.forEach((id) => next.add(id))
        return next
      })
    }
    // Clean up stale IDs from deleted categories
    setExpandedCategories((prev) => {
      const cleaned = new Set([...prev].filter((id) => currentIds.has(id)))
      if (cleaned.size !== prev.size) return cleaned
      return prev
    })
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

  const collapseAllCategories = () => {
    setExpandedCategories(new Set())
    setErrorsExpanded(false)
    setExpandedErrorCategories(new Set())
  }

  const expandAllCategories = () => {
    setExpandedCategories(new Set(categories.map((c) => c.id)))
    setErrorsExpanded(true)
    // Expand all error categories too
    const allErrorCats = Object.keys(ERROR_CATEGORIES) as ErrorCategory[]
    setExpandedErrorCategories(new Set(allErrorCats))
  }

  const toggleErrorCategory = (category: ErrorCategory) => {
    setExpandedErrorCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  const uncategorizedFeeds = filterAndSortFeeds(feeds.filter((f) => !f.category_id))
  const totalUnread = feeds.reduce((sum, f) => sum + f.unread_count, 0)
  const feedsWithErrors = feeds.filter((f) => f.last_error)

  // Group error feeds by error type
  const groupedErrorFeeds = useMemo(() => {
    const groups = new Map<ErrorCategory, Feed[]>()

    feedsWithErrors.forEach((feed) => {
      const category = categorizeError(feed.last_error || "")
      const existing = groups.get(category) || []
      existing.push(feed)
      groups.set(category, existing)
    })

    // Sort groups by priority
    return Array.from(groups.entries())
      .sort((a, b) => ERROR_CATEGORIES[a[0]].priority - ERROR_CATEGORIES[b[0]].priority)
  }, [feedsWithErrors])

  const handleBulkUnsubscribe = async (feedsToDelete: Feed[]) => {
    const count = feedsToDelete.length
    const categoryLabel = ERROR_CATEGORIES[categorizeError(feedsToDelete[0].last_error || "")].label
    if (!confirm(`Unsubscribe from ${count} feed(s) with ${categoryLabel} errors? This will remove all their entries.`)) {
      return
    }

    try {
      // Delete feeds one by one (could be optimized with batch endpoint)
      for (const feed of feedsToDelete) {
        await api.feeds.delete(feed.id)
      }
      const deletedIds = new Set(feedsToDelete.map((f) => f.id))
      onFeedsChange(feeds.filter((f) => !deletedIds.has(f.id)))

      // Clear selection if deleted feed was selected
      if (selectedFeedId !== null && deletedIds.has(selectedFeedId)) {
        onSelectFeed(null)
      }
    } catch (error) {
      console.error("Failed to unsubscribe feeds:", error)
    }
  }

  // Build tree structure: only render root categories (no parent)
  const rootCategories = categories.filter((c) => !c.parent_id)
  const childrenByParent = new Map<number, Category[]>()
  categories.forEach((c) => {
    if (c.parent_id) {
      const children = childrenByParent.get(c.parent_id) || []
      children.push(c)
      childrenByParent.set(c.parent_id, children)
    }
  })

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

  const handleRefreshFeed = async (feed: Feed) => {
    if (refreshingFeedId !== null) return // Already refreshing another feed

    setRefreshingFeedId(feed.id)
    try {
      const result = await api.feeds.refresh(feed.id)
      if (result.feed) {
        onFeedUpdated?.(result.feed)
      }
    } catch (error) {
      console.error("Failed to refresh feed:", error)
    } finally {
      setRefreshingFeedId(null)
    }
  }

  const handleUnsubscribeFeed = async (feed: Feed) => {
    if (!confirm(`Unsubscribe from "${feed.title}"? This will remove all entries from this feed.`)) return

    try {
      await api.feeds.delete(feed.id)
      onFeedsChange(feeds.filter((f) => f.id !== feed.id))
      if (selectedFeedId === feed.id) {
        onSelectFeed(null)
      }
    } catch (error) {
      console.error("Failed to unsubscribe:", error)
    }
  }

  // Collapsed view - just icons
  if (isCollapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="h-full flex flex-col border-r border-border bg-muted/30">
          <div className="h-12 px-1 flex items-center justify-center border-b border-border shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onToggleCollapse}
                  aria-label="Expand sidebar"
                >
                  <PanelLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar (b)</TooltipContent>
            </Tooltip>
          </div>

          <div className="flex-1 flex flex-col items-center gap-1 p-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  style={!selectedFeedId && !selectedCategoryId && !virtualFeed ? {
                    backgroundColor: "var(--color-accent-primary-dark)",
                    color: "white",
                  } : undefined}
                  onClick={() => {
                    onSelectFeed(null)
                    onSelectCategory(null)
                    onSelectVirtualFeed(null)
                  }}
                  aria-label="All Feeds"
                >
                  <Rss className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                All Feeds {totalUnread > 0 && `(${totalUnread})`}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  style={virtualFeed === "fresh" ? {
                    backgroundColor: "var(--color-accent-primary-dark)",
                    color: "white",
                  } : undefined}
                  onClick={() => onSelectVirtualFeed("fresh")}
                  aria-label="Fresh"
                >
                  <Clock className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Fresh</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  style={virtualFeed === "starred" ? {
                    backgroundColor: "var(--color-accent-primary-dark)",
                    color: "white",
                  } : undefined}
                  onClick={() => onSelectVirtualFeed("starred")}
                  aria-label="Starred"
                >
                  <Star className="h-4 w-4" style={{ color: "var(--color-accent-secondary)" }} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Starred</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  style={virtualFeed === "published" ? {
                    backgroundColor: "var(--color-accent-primary-dark)",
                    color: "white",
                  } : undefined}
                  onClick={() => onSelectVirtualFeed("published")}
                  aria-label="Published"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Published</TooltipContent>
            </Tooltip>

            <div className="h-px bg-border my-1 w-full" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onRefreshAll}
                  disabled={isRefreshing}
                  aria-label="Refresh all feeds"
                >
                  <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Refresh all feeds (r)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onSubscribe}
                  aria-label="Subscribe to feed"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Subscribe to feed</TooltipContent>
            </Tooltip>

            <div className="flex-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onSettings}
                  aria-label="Settings"
                >
                  <Cog className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Settings</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <div className="h-full flex flex-col border-r border-border bg-muted/30">
      <div className="px-3 py-2 border-b border-border shrink-0">
        {/* Top toolbar row */}
        <div className="flex items-center justify-between gap-0.5 mb-2">
          {/* Left side: Toggle sidebar, Add feed */}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onToggleCollapse}
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Add...">
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
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
          </div>
          {/* Right side: Settings */}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onSettings} aria-label="Settings">
            <Cog className="h-4 w-4" />
          </Button>
        </div>
        {/* Centered logo and title */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <NibblerLogo size={40} />
          <span className="font-semibold">NibbleRSS</span>
        </div>
        {/* Secondary toolbar row */}
        <div className="flex items-center justify-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggleHideRead}
            aria-label={hideReadFeeds ? "Show all feeds" : "Hide read feeds"}
          >
            {hideReadFeeds ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", sortByUnread && "text-primary")}
            onClick={toggleSortByUnread}
            aria-label={sortByUnread ? "Sort alphabetically" : "Sort by unread count"}
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRefreshAll}
            disabled={isRefreshing}
            aria-label="Refresh all feeds"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={expandAllCategories}
            aria-label="Expand all categories"
          >
            <ChevronsUpDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={collapseAllCategories}
            aria-label="Collapse all categories"
          >
            <ChevronsDownUp className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 mb-1"
            style={!selectedFeedId && !selectedCategoryId && !virtualFeed ? {
              backgroundColor: "var(--color-accent-primary-dark)",
              color: "white",
            } : undefined}
            onClick={() => {
              onSelectFeed(null)
              onSelectCategory(null)
              onSelectVirtualFeed(null)
            }}
          >
            <Rss className="h-4 w-4" />
            <span className={cn(
              "flex-1 text-left",
              totalUnread > 0 ? "font-medium" : "text-muted-foreground"
            )}>All Feeds</span>
            {totalUnread > 0 && <Badge variant="secondary">{totalUnread}</Badge>}
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-2 mb-1"
            style={virtualFeed === "fresh" ? {
              backgroundColor: "var(--color-accent-primary-dark)",
              color: "white",
            } : undefined}
            onClick={() => onSelectVirtualFeed("fresh")}
          >
            <Clock className="h-4 w-4" />
            <span className={cn(
              "flex-1 text-left",
              totalUnread > 0 ? "font-medium" : "text-muted-foreground"
            )}>Fresh</span>
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-2 mb-1"
            style={virtualFeed === "starred" ? {
              backgroundColor: "var(--color-accent-primary-dark)",
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
              backgroundColor: "var(--color-accent-primary-dark)",
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
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 h-8 text-destructive hover:text-destructive"
                  onClick={() => setErrorsExpanded((prev) => !prev)}
                >
                  <span className="shrink-0">
                    {errorsExpanded ? (
                      <FolderOpen className="h-4 w-4" />
                    ) : (
                      <Folder className="h-4 w-4" />
                    )}
                  </span>
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">Errors ({feedsWithErrors.length})</span>
                </Button>
                {errorsExpanded && (
                  <div className="space-y-1 ml-4">
                    {groupedErrorFeeds.map(([errorCategory, errorFeeds]) => (
                      <div key={errorCategory}>
                        <Button
                          variant="ghost"
                          className="w-full justify-start gap-2 h-7 text-xs text-muted-foreground hover:text-muted-foreground"
                          onClick={() => toggleErrorCategory(errorCategory)}
                        >
                          <span className="shrink-0">
                            {expandedErrorCategories.has(errorCategory) ? (
                              <FolderOpen className="h-3 w-3" />
                            ) : (
                              <Folder className="h-3 w-3" />
                            )}
                          </span>
                          <span className="flex-1 text-left">{ERROR_CATEGORIES[errorCategory].label} ({errorFeeds.length})</span>
                        </Button>
                        {expandedErrorCategories.has(errorCategory) && (
                          <div className="space-y-0.5 ml-4">
                            {errorFeeds.map((feed) => (
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
                            <Button
                              variant="ghost"
                              className="w-full justify-start gap-2 h-7 text-xs text-destructive hover:text-destructive"
                              onClick={() => handleBulkUnsubscribe(errorFeeds)}
                            >
                              <Trash2 className="h-3 w-3" />
                              <span className="flex-1 text-left">Unsubscribe all ({errorFeeds.length})</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <div className="h-px bg-border my-2" />

          {rootCategories.map((category) => {
            const categoryFeeds = filterAndSortFeeds(
              feeds.filter((f) => f.category_id === category.id)
            )
            const childCategories = childrenByParent.get(category.id) || []
            // Hide empty categories when hiding read feeds (only if no children with unread)
            const hasUnreadChildren = childCategories.some((child) =>
              feeds.some((f) => f.category_id === child.id && f.unread_count > 0)
            )
            if (hideReadFeeds && categoryFeeds.length === 0 && !hasUnreadChildren) return null
            return (
              <CategoryItem
                key={category.id}
                category={category}
                feeds={categoryFeeds}
                childCategories={childCategories}
                allCategories={categories}
                allFeeds={feeds}
                childrenByParent={childrenByParent}
                depth={0}
                isExpanded={expandedCategories.has(category.id)}
                expandedCategories={expandedCategories}
                selectedFeedId={selectedFeedId}
                selectedCategoryId={selectedCategoryId}
                refreshingFeedId={refreshingFeedId}
                onToggle={() => toggleCategory(category.id)}
                onToggleCategory={toggleCategory}
                onSelectFeed={onSelectFeed}
                onSelectCategory={onSelectCategory}
                onEditFeed={onEditFeed}
                onRefreshFeed={handleRefreshFeed}
                onUnsubscribeFeed={handleUnsubscribeFeed}
                onEditCategory={setEditingCategory}
                onDeleteCategory={handleDeleteCategory}
                hideReadFeeds={hideReadFeeds}
                filterAndSortFeeds={filterAndSortFeeds}
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
                  onRefresh={() => handleRefreshFeed(feed)}
                  onUnsubscribe={() => handleUnsubscribeFeed(feed)}
                  isRefreshing={refreshingFeedId === feed.id}
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
  childCategories: Category[]
  allCategories: Category[]
  allFeeds: Feed[]
  childrenByParent: Map<number, Category[]>
  depth: number
  isExpanded: boolean
  expandedCategories: Set<number>
  selectedFeedId: number | null
  selectedCategoryId: number | null
  refreshingFeedId: number | null
  onToggle: () => void
  onToggleCategory: (categoryId: number) => void
  onSelectFeed: (feedId: number | null) => void
  onSelectCategory: (categoryId: number | null) => void
  onEditFeed: (feed: Feed) => void
  onRefreshFeed: (feed: Feed) => void
  onUnsubscribeFeed: (feed: Feed) => void
  onEditCategory: (category: Category) => void
  onDeleteCategory: (category: Category) => void
  hideReadFeeds: boolean
  filterAndSortFeeds: (feeds: Feed[]) => Feed[]
}

function CategoryItem({
  category,
  feeds,
  childCategories,
  allCategories,
  allFeeds,
  childrenByParent,
  depth,
  isExpanded,
  expandedCategories,
  selectedFeedId,
  selectedCategoryId,
  refreshingFeedId,
  onToggle,
  onToggleCategory,
  onSelectFeed,
  onSelectCategory,
  onEditFeed,
  onRefreshFeed,
  onUnsubscribeFeed,
  onEditCategory,
  onDeleteCategory,
  hideReadFeeds,
  filterAndSortFeeds,
}: CategoryItemProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  // Calculate unread count including all descendants
  const getDescendantUnreadCount = (cat: Category): number => {
    const directFeeds = allFeeds.filter((f) => f.category_id === cat.id)
    const directUnread = directFeeds.reduce((sum, f) => sum + f.unread_count, 0)
    const children = childrenByParent.get(cat.id) || []
    const childUnread = children.reduce((sum, child) => sum + getDescendantUnreadCount(child), 0)
    return directUnread + childUnread
  }

  const unreadCount = getDescendantUnreadCount(category)

  // Check if any descendant feed is selected
  const hasSelectedDescendant = (cat: Category): boolean => {
    if (selectedFeedId !== null && allFeeds.some((f) => f.category_id === cat.id && f.id === selectedFeedId)) {
      return true
    }
    const children = childrenByParent.get(cat.id) || []
    return children.some((child) => hasSelectedDescendant(child))
  }

  const hasSelectedChild = hasSelectedDescendant(category)
  const isSelected = selectedCategoryId === category.id

  // Determine button style based on selection state
  const getButtonStyle = () => {
    if (isSelected) {
      return {
        backgroundColor: "var(--color-accent-primary-dark)",
        color: "white",
      }
    }
    if (hasSelectedChild) {
      // Subtle highlight for parent folder when child feed is selected
      // Use darker variant in dark mode, lighter variant in light mode
      return isDark
        ? {
            backgroundColor: "var(--color-accent-primary-darker)",
            color: "var(--color-accent-primary-light)",
          }
        : {
            backgroundColor: "var(--color-accent-primary-lighter)",
            color: "var(--color-accent-primary-dark)",
          }
    }
    return undefined
  }

  // Indentation based on depth
  const paddingLeft = depth * 16 + 8 // 8px base + 16px per depth level

  return (
    <div className="group/category">
      <div className="flex items-center">
        <Button
          variant="ghost"
          className="flex-1 justify-start gap-2 h-8"
          style={{ ...getButtonStyle(), paddingLeft: `${paddingLeft}px` }}
          onClick={() => onSelectCategory(category.id)}
        >
          <span
            className="shrink-0 cursor-pointer hover:opacity-70"
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
          >
            {isExpanded ? (
              <FolderOpen className="h-4 w-4" />
            ) : (
              <Folder className="h-4 w-4" />
            )}
          </span>
          <span className={cn(
            "flex-1 text-left truncate",
            unreadCount > 0 ? "font-medium" : "text-muted-foreground"
          )}>{category.title}</span>
          {unreadCount > 0 && <Badge variant="secondary">{unreadCount}</Badge>}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover/category:opacity-100 shrink-0"
              aria-label={`${category.title} menu`}
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
        <>
          {/* Render feeds in this category */}
          <div style={{ marginLeft: `${(depth + 1) * 16 + 8}px` }}>
            {feeds.map((feed) => (
              <FeedItem
                key={feed.id}
                feed={feed}
                isSelected={selectedFeedId === feed.id}
                onSelect={() => onSelectFeed(feed.id)}
                onEdit={() => onEditFeed(feed)}
                onRefresh={() => onRefreshFeed(feed)}
                onUnsubscribe={() => onUnsubscribeFeed(feed)}
                isRefreshing={refreshingFeedId === feed.id}
              />
            ))}
          </div>
          {/* Render child categories recursively */}
          {childCategories.map((childCategory) => {
            const childFeeds = filterAndSortFeeds(
              allFeeds.filter((f) => f.category_id === childCategory.id)
            )
            const grandChildren = childrenByParent.get(childCategory.id) || []
            // Hide empty child categories when hiding read feeds
            const hasUnreadDescendants = grandChildren.some((gc) =>
              allFeeds.some((f) => f.category_id === gc.id && f.unread_count > 0)
            )
            if (hideReadFeeds && childFeeds.length === 0 && !hasUnreadDescendants) return null
            return (
              <CategoryItem
                key={childCategory.id}
                category={childCategory}
                feeds={childFeeds}
                childCategories={grandChildren}
                allCategories={allCategories}
                allFeeds={allFeeds}
                childrenByParent={childrenByParent}
                depth={depth + 1}
                isExpanded={expandedCategories.has(childCategory.id)}
                expandedCategories={expandedCategories}
                selectedFeedId={selectedFeedId}
                selectedCategoryId={selectedCategoryId}
                refreshingFeedId={refreshingFeedId}
                onToggle={() => onToggleCategory(childCategory.id)}
                onToggleCategory={onToggleCategory}
                onSelectFeed={onSelectFeed}
                onSelectCategory={onSelectCategory}
                onEditFeed={onEditFeed}
                onRefreshFeed={onRefreshFeed}
                onUnsubscribeFeed={onUnsubscribeFeed}
                onEditCategory={onEditCategory}
                onDeleteCategory={onDeleteCategory}
                hideReadFeeds={hideReadFeeds}
                filterAndSortFeeds={filterAndSortFeeds}
              />
            )
          })}
        </>
      )}
    </div>
  )
}

interface FeedItemProps {
  feed: Feed
  isSelected: boolean
  onSelect: () => void
  onEdit: () => void
  onRefresh: () => void
  onUnsubscribe: () => void
  isRefreshing?: boolean
}

function FeedItem({ feed, isSelected, onSelect, onEdit, onRefresh, onUnsubscribe, isRefreshing }: FeedItemProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group flex items-center">
          <Button
            variant="ghost"
            className="flex-1 justify-start gap-2 h-8"
            style={isSelected ? {
              backgroundColor: "var(--color-accent-primary-dark)",
              color: "white",
            } : undefined}
            onClick={onSelect}
          >
            {feed.icon_url ? (
              <img src={feed.icon_url} className="h-4 w-4" alt="" />
            ) : (
              <Rss className="h-4 w-4 text-muted-foreground" />
            )}
            <span className={cn(
              "flex-1 text-left truncate",
              feed.unread_count > 0 ? "font-medium" : "text-muted-foreground"
            )}>{feed.title}</span>
            {isRefreshing && (
              <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
            )}
            {!isRefreshing && feed.last_error && (
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
                aria-label={`${feed.title} menu`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRefresh} disabled={isRefreshing}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync Now
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Settings className="mr-2 h-4 w-4" />
                Edit Feed
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onUnsubscribe} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Unsubscribe
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Sync Now
        </ContextMenuItem>
        <ContextMenuItem onClick={onEdit}>
          <Settings className="mr-2 h-4 w-4" />
          Edit Feed...
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onUnsubscribe} variant="destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Unsubscribe
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
