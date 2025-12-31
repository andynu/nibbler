import { useState, useEffect, useMemo, useRef } from "react"
import { useAltKeyHeld } from "@/hooks/useAltKeyHeld"
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core"
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
import { Rss, Folder, FolderOpen, RefreshCw, Star, Clock, Send, Plus, MoreHorizontal, Settings, AlertCircle, Cog, FolderPlus, Pencil, Trash2, Eye, EyeOff, ArrowUpDown, PanelLeftClose, PanelLeft, ChevronsUpDown, ChevronsDownUp, Crosshair, GripVertical, Tags, Tag } from "lucide-react"
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
import { getAllVirtualFolders, getVirtualFoldersByMode, SmartFolderIcon, type VirtualFolder } from "@/lib/virtualFolders"

type VirtualFeed = string | null

interface FeedSidebarProps {
  feeds: Feed[]
  categories: Category[]
  selectedFeedId: number | null
  selectedCategoryId: number | null
  virtualFeed: VirtualFeed
  selectedTag: string | null
  tagsWithCounts: Array<{ name: string; count: number }>
  virtualFolderCounts?: {
    fresh: number
    starred: number
    published: number
  } | null
  onSelectFeed: (feedId: number | null) => void
  onSelectCategory: (categoryId: number | null) => void
  onSelectVirtualFeed: (feed: VirtualFeed) => void
  onSelectTag: (tag: string | null) => void
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
  trackedFeedId: number | null
}

export function FeedSidebar({
  feeds,
  categories,
  selectedFeedId,
  selectedCategoryId,
  virtualFeed,
  selectedTag,
  tagsWithCounts,
  virtualFolderCounts,
  onSelectFeed,
  onSelectCategory,
  onSelectVirtualFeed,
  onSelectTag,
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
  trackedFeedId,
}: FeedSidebarProps) {
  const { preferences, updatePreference } = usePreferences()

  // Track Alt key for switching between unread and total counts
  const showTotalCount = useAltKeyHeld()

  // Track whether we've completed initial load (to avoid auto-expanding on first render)
  const hasInitializedRef = useRef(false)

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

  // Track known category IDs to distinguish new categories from collapsed ones
  // Initialize empty - will be populated after first render with actual categories
  const knownCategoryIds = useRef<Set<number>>(new Set())

  const [showCategoryDialog, setShowCategoryDialog] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [newCategoryParentId, setNewCategoryParentId] = useState<number | null>(null)
  const [refreshingFeedId, setRefreshingFeedId] = useState<number | null>(null)

  const [errorsExpanded, setErrorsExpanded] = useState(() => {
    try {
      return localStorage.getItem("nibbler:errorsExpanded") === "true"
    } catch {}
    return false
  })

  // Track which smart folders are expanded
  const [expandedSmartFolders, setExpandedSmartFolders] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("nibbler:expandedSmartFolders")
      if (saved) {
        return new Set(JSON.parse(saved) as string[])
      }
    } catch {}
    return new Set()
  })

  // Track whether the tags folder is expanded
  const [tagsExpanded, setTagsExpanded] = useState(() => {
    try {
      return localStorage.getItem("nibbler:tagsExpanded") === "true"
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
  const syncToTree = preferences.sync_to_tree === "true"

  // Ref to the scroll viewport for tracking mode scrolling
  const scrollViewportRef = useRef<HTMLDivElement>(null)

  // Drag and drop state
  const [activeDragId, setActiveDragId] = useState<number | null>(null)
  const activeDragFeed = activeDragId ? feeds.find((f) => f.id === activeDragId) : null

  // Drag and drop sensors - require some movement before starting drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    const feedId = event.active.id as number
    setActiveDragId(feedId)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragId(null)

    if (!over) return

    const feedId = active.id as number
    const overId = over.id as string

    // Check if dropped on a category
    if (overId.startsWith("category-")) {
      const categoryId = parseInt(overId.replace("category-", ""), 10)
      const feed = feeds.find((f) => f.id === feedId)

      // Only update if the category is different
      if (feed && feed.category_id !== categoryId) {
        try {
          const updatedFeed = await api.feeds.update(feedId, {
            feed: { category_id: categoryId },
          })
          onFeedsChange(feeds.map((f) => (f.id === feedId ? updatedFeed : f)))
          onFeedUpdated?.(updatedFeed)
        } catch (error) {
          console.error("Failed to move feed:", error)
        }
      }
    }
  }

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

  // Persist expanded smart folders
  useEffect(() => {
    try {
      localStorage.setItem("nibbler:expandedSmartFolders", JSON.stringify([...expandedSmartFolders]))
    } catch {}
  }, [expandedSmartFolders])

  // Persist tags folder expansion
  useEffect(() => {
    try {
      localStorage.setItem("nibbler:tagsExpanded", String(tagsExpanded))
    } catch {}
  }, [tagsExpanded])

  // When new categories are added, default them to expanded (but not collapsed ones)
  useEffect(() => {
    const currentIds = new Set(categories.map((c) => c.id))

    // On first run with actual categories, just mark them all as known
    // Don't auto-expand - respect the localStorage state
    if (!hasInitializedRef.current && categories.length > 0) {
      hasInitializedRef.current = true
      knownCategoryIds.current = currentIds

      // Clean up stale IDs from deleted categories (categories that were saved but no longer exist)
      setExpandedCategories((prev) => {
        const cleaned = new Set([...prev].filter((id) => currentIds.has(id)))
        if (cleaned.size !== prev.size) return cleaned
        return prev
      })
      return
    }

    // Only expand categories that we haven't seen before (truly new - created this session)
    const trulyNewCategoryIds = categories
      .filter((c) => !knownCategoryIds.current.has(c.id))
      .map((c) => c.id)

    if (trulyNewCategoryIds.length > 0) {
      setExpandedCategories((prev) => {
        const next = new Set(prev)
        trulyNewCategoryIds.forEach((id) => next.add(id))
        return next
      })
    }

    // Update known IDs to include all current categories
    knownCategoryIds.current = currentIds

    // Clean up stale IDs from deleted categories
    setExpandedCategories((prev) => {
      const cleaned = new Set([...prev].filter((id) => currentIds.has(id)))
      if (cleaned.size !== prev.size) return cleaned
      return prev
    })
  }, [categories])

  // Auto-expand categories to show tracked feed
  useEffect(() => {
    if (!trackedFeedId) return

    const trackedFeed = feeds.find((f) => f.id === trackedFeedId)

    // If the feed has a category, expand its ancestors
    if (trackedFeed?.category_id) {
      // Find category ancestry for the tracked feed
      const categoryAncestors: number[] = []
      let currentCategoryId: number | null = trackedFeed.category_id

      while (currentCategoryId !== null) {
        categoryAncestors.push(currentCategoryId)
        const currentCategory = categories.find((c) => c.id === currentCategoryId)
        currentCategoryId = currentCategory?.parent_id ?? null
      }

      // Expand all ancestor categories
      if (categoryAncestors.length > 0) {
        setExpandedCategories((prev) => {
          const next = new Set(prev)
          let changed = false
          categoryAncestors.forEach((id) => {
            if (!next.has(id)) {
              next.add(id)
              changed = true
            }
          })
          return changed ? next : prev
        })
      }
    }

    // Scroll to the tracked feed element after categories expand
    // Use setTimeout to ensure DOM updates after category expansion
    const timeoutId = setTimeout(() => {
      const feedElement = document.querySelector(`[data-feed-id="${trackedFeedId}"]`) as HTMLElement | null
      const viewport = scrollViewportRef.current
      if (!feedElement || !viewport) return

      // Calculate vertical scroll position manually to avoid horizontal scrolling
      const elementRect = feedElement.getBoundingClientRect()
      const viewportRect = viewport.getBoundingClientRect()

      // Check if element is already visible in viewport
      const isAboveViewport = elementRect.top < viewportRect.top
      const isBelowViewport = elementRect.bottom > viewportRect.bottom

      if (isAboveViewport) {
        // Scroll element to top of viewport (with small margin)
        viewport.scrollTop += elementRect.top - viewportRect.top - 8
      } else if (isBelowViewport) {
        // Scroll element to bottom of viewport (with small margin)
        viewport.scrollTop += elementRect.bottom - viewportRect.bottom + 8
      }
      // If element is already visible, don't scroll
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [trackedFeedId, feeds, categories])

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

  const toggleSyncToTree = () => {
    updatePreference("sync_to_tree", syncToTree ? "false" : "true")
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
  const totalEntryCount = feeds.reduce((sum, f) => sum + f.entry_count, 0)
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

  const handleBulkUnsubscribe = async (feedsToDelete: Feed[], confirmMessage: string) => {
    const count = feedsToDelete.length
    if (!confirm(confirmMessage)) {
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

  const handleBulkUnsubscribeError = async (feedsToDelete: Feed[]) => {
    const count = feedsToDelete.length
    const categoryLabel = ERROR_CATEGORIES[categorizeError(feedsToDelete[0].last_error || "")].label
    await handleBulkUnsubscribe(
      feedsToDelete,
      `Unsubscribe from ${count} feed(s) with ${categoryLabel} errors? This will remove all their entries.`
    )
  }

  const handleBulkUnsubscribeSmartFolder = async (feedsToDelete: Feed[], folderName: string) => {
    const count = feedsToDelete.length
    await handleBulkUnsubscribe(
      feedsToDelete,
      `Unsubscribe from all ${count} feeds in "${folderName}"? This will remove all their entries.`
    )
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
    setNewCategoryParentId(null) // Reset parent after creation
  }

  const handleAddChildCategory = (parentCategory: Category) => {
    setNewCategoryParentId(parentCategory.id)
    setShowCategoryDialog(true)
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
            className="h-7 w-7"
            style={sortByUnread ? { color: "var(--color-accent-primary)" } : undefined}
            onClick={toggleSortByUnread}
            aria-label={sortByUnread ? "Sort alphabetically" : "Sort by unread count"}
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            style={syncToTree ? { color: "var(--color-accent-primary)" } : undefined}
            onClick={toggleSyncToTree}
            aria-label={syncToTree ? "Disable sync to tree" : "Sync sidebar to current article's feed"}
            title={syncToTree ? "Disable sync to tree" : "Sync sidebar to current article's feed"}
          >
            <Crosshair className="h-4 w-4" />
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

      <ScrollArea className="flex-1" viewportRef={scrollViewportRef}>
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
        <div className="p-2">
          {/* Item-list virtual folders (All Feeds, Fresh, Starred, Published) */}
          {getVirtualFoldersByMode("item-list").map((folder) => {
            const Icon = folder.icon
            // Special case: empty string id means "All Feeds" (no virtual feed selected)
            const isSelected = folder.id === ""
              ? (!selectedFeedId && !selectedCategoryId && virtualFeed === null)
              : virtualFeed === folder.id
            const handleClick = () => {
              if (folder.id === "") {
                onSelectFeed(null)
                onSelectCategory(null)
                onSelectVirtualFeed(null)
              } else {
                onSelectVirtualFeed(folder.id)
              }
            }

            // Get count for virtual folder (Fresh, Starred, Published show their counts; All Feeds shows unread/total)
            const getVirtualFolderCount = (): number | null => {
              if (folder.id === "") {
                return showTotalCount ? totalEntryCount : totalUnread
              }
              if (!virtualFolderCounts) return null
              switch (folder.id) {
                case "fresh":
                  return virtualFolderCounts.fresh
                case "starred":
                  return virtualFolderCounts.starred
                case "published":
                  return virtualFolderCounts.published
                default:
                  return null
              }
            }

            const folderCount = getVirtualFolderCount()

            return (
              <Button
                key={folder.id || "all"}
                variant="ghost"
                className="w-full justify-start gap-2 mb-1"
                style={isSelected ? {
                  backgroundColor: "var(--color-accent-primary-dark)",
                  color: "white",
                } : undefined}
                onClick={handleClick}
              >
                {folder.isSmart ? (
                  <SmartFolderIcon icon={Icon} className="h-4 w-4" iconColor={folder.iconColor} />
                ) : (
                  <Icon className="h-4 w-4" style={folder.iconColor ? { color: folder.iconColor } : undefined} />
                )}
                <span className={cn(
                  "flex-1 text-left",
                  (folder.id === "" && totalUnread > 0) || (folder.id === "fresh" && (virtualFolderCounts?.fresh ?? 0) > 0) ? "font-medium" : undefined
                )}>{folder.name}</span>
                {folderCount !== null && folderCount > 0 && (
                  <Badge variant="secondary">{folderCount}</Badge>
                )}
              </Button>
            )
          })}

          {/* Feed-list virtual folders (smart folders: Uncategorized, Dead Letter Box) */}
          {getVirtualFoldersByMode("feed-list").map((folder) => {
            const Icon = folder.icon
            const matchingFeeds = folder.filterFeeds ? filterAndSortFeeds(folder.filterFeeds(feeds)) : []
            const matchCount = matchingFeeds.length
            const isExpanded = expandedSmartFolders.has(folder.id)

            // Don't show empty smart folders
            if (matchCount === 0) return null

            const toggleExpand = () => {
              setExpandedSmartFolders((prev) => {
                const next = new Set(prev)
                if (next.has(folder.id)) {
                  next.delete(folder.id)
                } else {
                  next.add(folder.id)
                }
                return next
              })
            }

            return (
              <ContextMenu key={folder.id}>
                <ContextMenuTrigger asChild>
                  <div className="group/smartfolder">
                    <div className="flex items-center">
                      <Button
                        variant="ghost"
                        className="flex-1 justify-start gap-2 mb-1"
                        onClick={toggleExpand}
                      >
                        <span className="shrink-0">
                          {isExpanded ? (
                            <FolderOpen className="h-4 w-4" />
                          ) : (
                            <Folder className="h-4 w-4" />
                          )}
                        </span>
                        {folder.isSmart ? (
                          <SmartFolderIcon icon={Icon} className="h-4 w-4" iconColor={folder.iconColor} />
                        ) : (
                          <Icon className="h-4 w-4" style={folder.iconColor ? { color: folder.iconColor } : undefined} />
                        )}
                        <span className="flex-1 text-left">{folder.name}</span>
                        <Badge variant="secondary">{matchCount}</Badge>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover/smartfolder:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleBulkUnsubscribeSmartFolder(matchingFeeds, folder.name)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Unsubscribe all ({matchCount})
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                {isExpanded && (
                      <div className="ml-6">
                        {matchingFeeds.map((feed) => (
                          <FeedItem
                            key={feed.id}
                            feed={feed}
                            isSelected={selectedFeedId === feed.id}
                            isTracked={trackedFeedId === feed.id}
                            isDragging={false}
                            onSelect={() => onSelectFeed(feed.id)}
                            onEdit={() => handleEditFeed(feed)}
                            onRefresh={() => handleRefresh(feed)}
                            onUnsubscribe={() => handleUnsubscribeFeed(feed)}
                            isRefreshing={refreshingFeedId === feed.id}
                            showTotalCount={showTotalCount}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    onClick={() => handleBulkUnsubscribeSmartFolder(matchingFeeds, folder.name)}
                    variant="destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Unsubscribe all ({matchCount})
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )
          })}

          {/* Tags virtual folder */}
          {tagsWithCounts.length > 0 && (
            <div className="group/tagsfolder">
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  className="flex-1 justify-start gap-2 mb-1"
                  onClick={() => setTagsExpanded((prev) => !prev)}
                >
                  <span className="shrink-0">
                    {tagsExpanded ? (
                      <FolderOpen className="h-4 w-4" />
                    ) : (
                      <Folder className="h-4 w-4" />
                    )}
                  </span>
                  <SmartFolderIcon icon={Tags} className="h-4 w-4" />
                  <span className="flex-1 text-left">Tags</span>
                  <Badge variant="secondary">{tagsWithCounts.length}</Badge>
                </Button>
              </div>
              {tagsExpanded && (
                <div className="ml-6 space-y-0.5">
                  {tagsWithCounts.map((tag) => (
                    <Button
                      key={tag.name}
                      variant="ghost"
                      className={cn(
                        "w-full justify-start gap-2 h-8 text-sm",
                        selectedTag === tag.name && "bg-accent text-accent-foreground"
                      )}
                      onClick={() => onSelectTag(tag.name)}
                    >
                      <Tag className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left truncate">{tag.name}</span>
                      <Badge variant="secondary" className="ml-auto">
                        {tag.count}
                      </Badge>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

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
                              onClick={() => handleBulkUnsubscribeError(errorFeeds)}
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
                trackedFeedId={trackedFeedId}
                activeDragId={activeDragId}
                onToggle={() => toggleCategory(category.id)}
                onToggleCategory={toggleCategory}
                onSelectFeed={onSelectFeed}
                onSelectCategory={onSelectCategory}
                onEditFeed={onEditFeed}
                onRefreshFeed={handleRefreshFeed}
                onUnsubscribeFeed={handleUnsubscribeFeed}
                onEditCategory={setEditingCategory}
                onDeleteCategory={handleDeleteCategory}
                onAddChildCategory={handleAddChildCategory}
                hideReadFeeds={hideReadFeeds}
                filterAndSortFeeds={filterAndSortFeeds}
                showTotalCount={showTotalCount}
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
                  isTracked={trackedFeedId === feed.id}
                  isDragging={activeDragId === feed.id}
                  onSelect={() => onSelectFeed(feed.id)}
                  onEdit={() => onEditFeed(feed)}
                  onRefresh={() => handleRefreshFeed(feed)}
                  onUnsubscribe={() => handleUnsubscribeFeed(feed)}
                  isRefreshing={refreshingFeedId === feed.id}
                  showTotalCount={showTotalCount}
                />
              ))}
            </>
          )}
        </div>

        {/* Drag overlay - shows the dragged feed */}
        <DragOverlay>
          {activeDragFeed && (
            <div className="flex items-center gap-2 px-3 py-2 bg-background border rounded-md shadow-lg opacity-90">
              {activeDragFeed.icon_url ? (
                <img src={activeDragFeed.icon_url} className="h-4 w-4" alt="" />
              ) : (
                <Rss className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm truncate">{activeDragFeed.title}</span>
            </div>
          )}
        </DragOverlay>
        </DndContext>
      </ScrollArea>

      <SyncStatusBar feeds={feeds} isRefreshing={isRefreshing} />

      <CategoryDialog
        open={showCategoryDialog || editingCategory !== null}
        onOpenChange={(open) => {
          if (!open) {
            setShowCategoryDialog(false)
            setEditingCategory(null)
            setNewCategoryParentId(null)
          }
        }}
        category={editingCategory}
        categories={categories}
        defaultParentId={newCategoryParentId}
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
  trackedFeedId: number | null
  activeDragId: number | null
  onToggle: () => void
  onToggleCategory: (categoryId: number) => void
  onSelectFeed: (feedId: number | null) => void
  onSelectCategory: (categoryId: number | null) => void
  onEditFeed: (feed: Feed) => void
  onRefreshFeed: (feed: Feed) => void
  onUnsubscribeFeed: (feed: Feed) => void
  onEditCategory: (category: Category) => void
  onDeleteCategory: (category: Category) => void
  onAddChildCategory: (parentCategory: Category) => void
  hideReadFeeds: boolean
  filterAndSortFeeds: (feeds: Feed[]) => Feed[]
  showTotalCount: boolean
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
  trackedFeedId,
  activeDragId,
  onToggle,
  onToggleCategory,
  onSelectFeed,
  onSelectCategory,
  onEditFeed,
  onRefreshFeed,
  onUnsubscribeFeed,
  onEditCategory,
  onDeleteCategory,
  onAddChildCategory,
  hideReadFeeds,
  filterAndSortFeeds,
  showTotalCount,
}: CategoryItemProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  // Make category a drop target
  const { isOver, setNodeRef } = useDroppable({
    id: `category-${category.id}`,
  })

  // Calculate count including all descendants (either unread or total based on showTotalCount)
  const getDescendantCount = (cat: Category, useTotal: boolean): number => {
    const directFeeds = allFeeds.filter((f) => f.category_id === cat.id)
    const directCount = directFeeds.reduce((sum, f) => sum + (useTotal ? f.entry_count : f.unread_count), 0)
    const children = childrenByParent.get(cat.id) || []
    const childCount = children.reduce((sum, child) => sum + getDescendantCount(child, useTotal), 0)
    return directCount + childCount
  }

  const displayCount = getDescendantCount(category, showTotalCount)
  const unreadCount = getDescendantCount(category, false)

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

  // Show drop indicator when dragging over and not already in this category
  const showDropIndicator = isOver && activeDragId !== null

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div ref={setNodeRef} className="group/category">
          <div className="flex items-center min-w-0">
            <Button
              variant="ghost"
              className={cn(
                "flex-1 justify-start gap-2 h-8 min-w-0",
                showDropIndicator && "ring-2 ring-primary ring-offset-1"
              )}
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
              {displayCount > 0 && <Badge variant="secondary" className="shrink-0">{displayCount}</Badge>}
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
                <DropdownMenuItem onClick={() => onAddChildCategory(category)}>
                  <FolderPlus className="mr-2 h-4 w-4" />
                  Add Subcategory
                </DropdownMenuItem>
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
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onAddChildCategory(category)}>
          <FolderPlus className="mr-2 h-4 w-4" />
          Add Subcategory
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onEditCategory(category)}>
          <Pencil className="mr-2 h-4 w-4" />
          Rename
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onDeleteCategory(category)} variant="destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
      {isExpanded && (
        <>
          {/* Render child categories first (sorted alphabetically) */}
          {[...childCategories].sort((a, b) => a.title.localeCompare(b.title)).map((childCategory) => {
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
                trackedFeedId={trackedFeedId}
                activeDragId={activeDragId}
                onToggle={() => onToggleCategory(childCategory.id)}
                onToggleCategory={onToggleCategory}
                onSelectFeed={onSelectFeed}
                onSelectCategory={onSelectCategory}
                onEditFeed={onEditFeed}
                onRefreshFeed={onRefreshFeed}
                onUnsubscribeFeed={onUnsubscribeFeed}
                onEditCategory={onEditCategory}
                onDeleteCategory={onDeleteCategory}
                onAddChildCategory={onAddChildCategory}
                hideReadFeeds={hideReadFeeds}
                filterAndSortFeeds={filterAndSortFeeds}
                showTotalCount={showTotalCount}
              />
            )
          })}
          {/* Render feeds in this category (after subcategories) */}
          <div style={{ marginLeft: `${(depth + 1) * 16 + 8}px` }}>
            {feeds.map((feed) => (
              <FeedItem
                key={feed.id}
                feed={feed}
                isSelected={selectedFeedId === feed.id}
                isTracked={trackedFeedId === feed.id}
                isDragging={activeDragId === feed.id}
                onSelect={() => onSelectFeed(feed.id)}
                onEdit={() => onEditFeed(feed)}
                onRefresh={() => onRefreshFeed(feed)}
                onUnsubscribe={() => onUnsubscribeFeed(feed)}
                isRefreshing={refreshingFeedId === feed.id}
                showTotalCount={showTotalCount}
              />
            ))}
          </div>
        </>
      )}
    </ContextMenu>
  )
}

interface FeedItemProps {
  feed: Feed
  isSelected: boolean
  isTracked?: boolean
  isDragging?: boolean
  onSelect: () => void
  onEdit: () => void
  onRefresh: () => void
  onUnsubscribe: () => void
  isRefreshing?: boolean
  showTotalCount?: boolean
}

function FeedItem({ feed, isSelected, isTracked, isDragging, onSelect, onEdit, onRefresh, onUnsubscribe, isRefreshing, showTotalCount }: FeedItemProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  // Make feed draggable
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: feed.id,
  })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  const getButtonStyle = () => {
    if (isSelected) {
      return {
        backgroundColor: "var(--color-accent-primary-dark)",
        color: "white",
      }
    }
    if (isTracked) {
      // Use secondary accent color for tracked feed
      return isDark
        ? {
            backgroundColor: "var(--color-accent-secondary-dark)",
            color: "white",
          }
        : {
            backgroundColor: "var(--color-accent-secondary-light)",
            color: "var(--color-accent-secondary-dark)",
          }
    }
    return undefined
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          className={cn("group flex items-center min-w-0", isDragging && "opacity-50")}
          data-feed-id={feed.id}
        >
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 opacity-0 group-hover:opacity-100 touch-none"
          >
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </div>
          <Button
            variant="ghost"
            className="flex-1 justify-start gap-2 h-8 min-w-0"
            style={getButtonStyle()}
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
            {(showTotalCount ? feed.entry_count > 0 : feed.unread_count > 0) && (
              <Badge variant="secondary" className="shrink-0">
                {showTotalCount ? feed.entry_count : feed.unread_count}
              </Badge>
            )}
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

interface SyncStatusBarProps {
  feeds: Feed[]
  isRefreshing: boolean
}

function SyncStatusBar({ feeds, isRefreshing }: SyncStatusBarProps) {
  const [, setTick] = useState(0)

  // Find the most recent last_updated timestamp from all feeds
  const lastSyncTime = useMemo(() => {
    let mostRecent: Date | null = null
    for (const feed of feeds) {
      if (feed.last_updated) {
        const feedTime = new Date(feed.last_updated)
        if (!mostRecent || feedTime > mostRecent) {
          mostRecent = feedTime
        }
      }
    }
    return mostRecent
  }, [feeds])

  // Update the display every minute to keep "X ago" current
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1)
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const formatTimeAgo = (date: Date): string => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return "just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  if (isRefreshing) {
    return (
      <div className="px-3 py-1.5 border-t border-border text-xs text-muted-foreground flex items-center gap-1.5 shrink-0">
        <RefreshCw className="h-3 w-3 animate-spin" />
        <span>Syncing...</span>
      </div>
    )
  }

  if (!lastSyncTime) {
    return (
      <div className="px-3 py-1.5 border-t border-border text-xs text-muted-foreground shrink-0">
        Never synced
      </div>
    )
  }

  return (
    <div className="px-3 py-1.5 border-t border-border text-xs text-muted-foreground shrink-0">
      Last sync: {formatTimeAgo(lastSyncTime)}
    </div>
  )
}
