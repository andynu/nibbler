import { useState, useEffect, useMemo, forwardRef } from "react"
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core"
import { snapCenterToCursor } from "@dnd-kit/modifiers"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { api, Feed, Category } from "@/lib/api"
import {
  Rss,
  Folder,
  FolderOpen,
  FolderInput,
  GripVertical,
  Plus,
  AlertCircle,
  Clock,
  CheckCircle2,
  RefreshCw,
  Settings,
  Info,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { CommandPalette } from "@/components/CommandPalette"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { FeedInfoDialog } from "@/components/FeedInfoDialog"
import { EditFeedDialog } from "@/components/EditFeedDialog"

// Format relative future time (e.g., "in 2h", "in 45m", "now")
function formatNextSync(nextPollAt: string | null): { label: string; ready: boolean } {
  if (!nextPollAt) {
    return { label: "now", ready: true }
  }

  const nextPoll = new Date(nextPollAt)
  const now = new Date()
  const diffMs = nextPoll.getTime() - now.getTime()

  if (diffMs <= 0) {
    return { label: "now", ready: true }
  }

  const diffMins = Math.ceil(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays > 0) {
    return { label: `${diffDays}d`, ready: false }
  }
  if (diffHours > 0) {
    return { label: `${diffHours}h`, ready: false }
  }
  return { label: `${diffMins}m`, ready: false }
}

function NextSyncIndicator({ feed }: { feed: Feed }) {
  const { label, ready } = formatNextSync(feed.next_poll_at)

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs shrink-0",
              ready ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
            )}
          >
            {ready ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <>
                <Clock className="h-3 w-3" />
                <span>{label}</span>
              </>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="left">
          {ready
            ? "Ready to sync"
            : `Next sync in ${label}`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface FeedOrganizerProps {
  feeds: Feed[]
  categories: Category[]
  onFeedsChange: (feeds: Feed[]) => void
  onCategoriesChange: (categories: Category[]) => void
}

type TreeItem =
  | { type: "category"; data: Category; feeds: Feed[] }
  | { type: "feed"; data: Feed; categoryId: number | null }

export function FeedOrganizer({
  feeds,
  categories,
  onFeedsChange,
  onCategoriesChange,
}: FeedOrganizerProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(
    new Set(categories.map((c) => c.id))
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showQuickMove, setShowQuickMove] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [infoFeed, setInfoFeed] = useState<Feed | null>(null)
  const [editFeed, setEditFeed] = useState<Feed | null>(null)
  const [refreshingFeedId, setRefreshingFeedId] = useState<number | null>(null)

  // Build tree structure
  const treeItems = useMemo(() => {
    const items: TreeItem[] = []

    // Add categories with their feeds
    for (const category of categories) {
      const categoryFeeds = feeds.filter((f) => f.category_id === category.id)
      items.push({ type: "category", data: category, feeds: categoryFeeds })
    }

    // Add uncategorized feeds
    const uncategorized = feeds.filter((f) => !f.category_id)
    for (const feed of uncategorized) {
      items.push({ type: "feed", data: feed, categoryId: null })
    }

    return items
  }, [feeds, categories])

  // Get all sortable IDs
  const sortableIds = useMemo(() => {
    const ids: string[] = []
    for (const item of treeItems) {
      if (item.type === "category") {
        ids.push(`category-${item.data.id}`)
        if (expandedCategories.has(item.data.id)) {
          for (const feed of item.feeds) {
            ids.push(`feed-${feed.id}`)
          }
        }
      } else {
        ids.push(`feed-${item.data.id}`)
      }
    }
    return ids
  }, [treeItems, expandedCategories])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over || active.id === over.id) return

    const activeId = active.id as string
    const overId = over.id as string

    // Handle feed movement
    if (activeId.startsWith("feed-")) {
      const feedId = parseInt(activeId.replace("feed-", ""), 10)
      let newCategoryId: number | null = null

      if (overId.startsWith("category-")) {
        newCategoryId = parseInt(overId.replace("category-", ""), 10)
      } else if (overId.startsWith("feed-")) {
        // Find which category the target feed is in
        const targetFeedId = parseInt(overId.replace("feed-", ""), 10)
        const targetFeed = feeds.find((f) => f.id === targetFeedId)
        newCategoryId = targetFeed?.category_id || null
      }

      // Update feed category
      try {
        const updatedFeed = await api.feeds.update(feedId, {
          feed: { category_id: newCategoryId },
        })
        onFeedsChange(
          feeds.map((f) => (f.id === feedId ? updatedFeed : f))
        )
      } catch (error) {
        console.error("Failed to move feed:", error)
      }
    }
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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if we're editing
      if (editingId) return

      // Ignore if focus is in an input
      if (document.activeElement?.tagName === "INPUT") return

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault()
          navigateNext()
          break
        case "k":
        case "ArrowUp":
          e.preventDefault()
          navigatePrevious()
          break
        case "Enter":
          e.preventDefault()
          if (selectedId?.startsWith("category-")) {
            const categoryId = parseInt(selectedId.replace("category-", ""), 10)
            toggleCategory(categoryId)
          } else if (selectedId) {
            startEditing(selectedId)
          }
          break
        case " ":
          e.preventDefault()
          if (selectedId?.startsWith("category-")) {
            const categoryId = parseInt(selectedId.replace("category-", ""), 10)
            toggleCategory(categoryId)
          }
          break
        case "m":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            if (selectedId?.startsWith("feed-")) {
              setShowQuickMove(true)
            }
          }
          break
        case "Delete":
        case "Backspace":
          if (selectedId) {
            e.preventDefault()
            handleDelete(selectedId)
          }
          break
        case "Escape":
          setSelectedId(null)
          break
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [selectedId, editingId, sortableIds])

  const navigateNext = () => {
    if (!selectedId) {
      setSelectedId(sortableIds[0] || null)
      return
    }
    const currentIndex = sortableIds.indexOf(selectedId)
    if (currentIndex < sortableIds.length - 1) {
      setSelectedId(sortableIds[currentIndex + 1])
    }
  }

  const navigatePrevious = () => {
    if (!selectedId) {
      setSelectedId(sortableIds[sortableIds.length - 1] || null)
      return
    }
    const currentIndex = sortableIds.indexOf(selectedId)
    if (currentIndex > 0) {
      setSelectedId(sortableIds[currentIndex - 1])
    }
  }

  const startEditing = (id: string) => {
    setEditingId(id)
    if (id.startsWith("feed-")) {
      const feedId = parseInt(id.replace("feed-", ""), 10)
      const feed = feeds.find((f) => f.id === feedId)
      setEditValue(feed?.title || "")
    } else if (id.startsWith("category-")) {
      const categoryId = parseInt(id.replace("category-", ""), 10)
      const category = categories.find((c) => c.id === categoryId)
      setEditValue(category?.title || "")
    }
  }

  const saveEdit = async () => {
    if (!editingId || !editValue.trim()) {
      setEditingId(null)
      return
    }

    try {
      if (editingId.startsWith("feed-")) {
        const feedId = parseInt(editingId.replace("feed-", ""), 10)
        const updatedFeed = await api.feeds.update(feedId, {
          feed: { title: editValue.trim() },
        })
        onFeedsChange(feeds.map((f) => (f.id === feedId ? updatedFeed : f)))
      } else if (editingId.startsWith("category-")) {
        const categoryId = parseInt(editingId.replace("category-", ""), 10)
        const updatedCategory = await api.categories.update(categoryId, {
          category: { title: editValue.trim() },
        })
        onCategoriesChange(
          categories.map((c) => (c.id === categoryId ? updatedCategory : c))
        )
      }
    } catch (error) {
      console.error("Failed to save:", error)
    }

    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm(
      id.startsWith("feed-")
        ? "Unsubscribe from this feed?"
        : "Delete this category? Feeds will become uncategorized."
    )
    if (!confirmed) return

    try {
      if (id.startsWith("feed-")) {
        const feedId = parseInt(id.replace("feed-", ""), 10)
        await api.feeds.delete(feedId)
        onFeedsChange(feeds.filter((f) => f.id !== feedId))
      } else if (id.startsWith("category-")) {
        const categoryId = parseInt(id.replace("category-", ""), 10)
        await api.categories.delete(categoryId)
        onCategoriesChange(categories.filter((c) => c.id !== categoryId))
        // Move feeds to uncategorized
        onFeedsChange(
          feeds.map((f) =>
            f.category_id === categoryId ? { ...f, category_id: null } : f
          )
        )
      }
      setSelectedId(null)
    } catch (error) {
      console.error("Failed to delete:", error)
    }
  }

  const handleQuickMove = async (categoryId: number) => {
    if (!selectedId?.startsWith("feed-")) return

    const feedId = parseInt(selectedId.replace("feed-", ""), 10)
    try {
      const updatedFeed = await api.feeds.update(feedId, {
        feed: { category_id: categoryId },
      })
      onFeedsChange(feeds.map((f) => (f.id === feedId ? updatedFeed : f)))
    } catch (error) {
      console.error("Failed to move feed:", error)
    }
    setShowQuickMove(false)
  }

  const handleMoveFeed = async (feed: Feed, categoryId: number | null) => {
    if (feed.category_id === categoryId) return
    try {
      const updatedFeed = await api.feeds.update(feed.id, {
        feed: { category_id: categoryId },
      })
      onFeedsChange(feeds.map((f) => (f.id === feed.id ? updatedFeed : f)))
    } catch (error) {
      console.error("Failed to move feed:", error)
    }
  }

  const handleAddCategory = async () => {
    const title = prompt("Category name:")
    if (!title?.trim()) return

    try {
      const newCategory = await api.categories.create({
        category: { title: title.trim() },
      })
      onCategoriesChange([...categories, newCategory])
      setExpandedCategories((prev) => new Set([...prev, newCategory.id]))
    } catch (error) {
      console.error("Failed to create category:", error)
    }
  }

  const handleRefreshFeed = async (feed: Feed) => {
    if (refreshingFeedId) return
    setRefreshingFeedId(feed.id)
    try {
      await api.feeds.refresh(feed.id)
      // Optionally reload feeds to get updated data
      const updatedFeeds = await api.feeds.list()
      onFeedsChange(updatedFeeds)
    } catch (error) {
      console.error("Failed to refresh feed:", error)
    } finally {
      setRefreshingFeedId(null)
    }
  }

  const handleFeedUpdated = (updatedFeed: Feed) => {
    onFeedsChange(feeds.map((f) => (f.id === updatedFeed.id ? updatedFeed : f)))
    setEditFeed(null)
  }

  const handleFeedDeleted = (feedId: number) => {
    onFeedsChange(feeds.filter((f) => f.id !== feedId))
    setEditFeed(null)
    setSelectedId(null)
  }

  const handleUnsubscribe = async (feed: Feed) => {
    const confirmed = window.confirm(`Unsubscribe from "${feed.title}"?`)
    if (!confirmed) return

    try {
      await api.feeds.delete(feed.id)
      onFeedsChange(feeds.filter((f) => f.id !== feed.id))
      setSelectedId(null)
    } catch (error) {
      console.error("Failed to unsubscribe:", error)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Feeds & Categories</h2>
        <Button variant="outline" size="sm" onClick={handleAddCategory}>
          <Plus className="h-4 w-4 mr-2" />
          Add Category
        </Button>
      </div>

      <div className="text-xs text-muted-foreground p-4 pb-2 border-b">
        <span className="font-medium">Keyboard:</span> j/k navigate, Enter edit/expand, Space toggle, Ctrl+M move, Delete remove
      </div>

      <ScrollArea className="flex-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortableIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="p-2">
              {treeItems.map((item) => {
                if (item.type === "category") {
                  const isExpanded = expandedCategories.has(item.data.id)
                  return (
                    <div key={`category-${item.data.id}`}>
                      <SortableItem
                        id={`category-${item.data.id}`}
                        isSelected={selectedId === `category-${item.data.id}`}
                        isEditing={editingId === `category-${item.data.id}`}
                        editValue={editValue}
                        onEditChange={setEditValue}
                        onEditSave={saveEdit}
                        onSelect={() => setSelectedId(`category-${item.data.id}`)}
                        onToggle={() => toggleCategory(item.data.id)}
                      >
                        {isExpanded ? (
                          <FolderOpen className="h-4 w-4 mr-2 shrink-0" />
                        ) : (
                          <Folder className="h-4 w-4 mr-2 shrink-0" />
                        )}
                        <span className="flex-1 truncate font-medium">
                          {item.data.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {item.feeds.length} feeds
                        </span>
                      </SortableItem>
                      {isExpanded && (
                        <div className="ml-6">
                          {item.feeds.map((feed) => (
                            <ContextMenu key={`feed-${feed.id}`}>
                              <ContextMenuTrigger asChild>
                                <SortableItem
                                  id={`feed-${feed.id}`}
                                  isSelected={selectedId === `feed-${feed.id}`}
                                  isEditing={editingId === `feed-${feed.id}`}
                                  editValue={editValue}
                                  onEditChange={setEditValue}
                                  onEditSave={saveEdit}
                                  onSelect={() => setSelectedId(`feed-${feed.id}`)}
                                >
                                  {refreshingFeedId === feed.id ? (
                                    <RefreshCw className="h-4 w-4 mr-2 shrink-0 animate-spin" />
                                  ) : feed.icon_url ? (
                                    <img
                                      src={feed.icon_url}
                                      className="h-4 w-4 mr-2 shrink-0"
                                      alt=""
                                    />
                                  ) : (
                                    <Rss className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
                                  )}
                                  <span className="flex-1 truncate">{feed.title}</span>
                                  <NextSyncIndicator feed={feed} />
                                  {feed.last_error && (
                                    <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
                                  )}
                                </SortableItem>
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuItem
                                  onClick={() => handleRefreshFeed(feed)}
                                  disabled={refreshingFeedId === feed.id}
                                >
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                  Sync Now
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => setEditFeed(feed)}>
                                  <Settings className="mr-2 h-4 w-4" />
                                  Edit Feed...
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => setInfoFeed(feed)}>
                                  <Info className="mr-2 h-4 w-4" />
                                  Feed Info...
                                </ContextMenuItem>
                                <ContextMenuSub>
                                  <ContextMenuSubTrigger>
                                    <FolderInput className="mr-2 h-4 w-4" />
                                    Move to...
                                  </ContextMenuSubTrigger>
                                  <ContextMenuSubContent>
                                    <ContextMenuItem
                                      onClick={() => handleMoveFeed(feed, null)}
                                      disabled={feed.category_id === null}
                                    >
                                      <Rss className="mr-2 h-4 w-4" />
                                      Uncategorized
                                    </ContextMenuItem>
                                    <ContextMenuSeparator />
                                    {categories.map((cat) => (
                                      <ContextMenuItem
                                        key={cat.id}
                                        onClick={() => handleMoveFeed(feed, cat.id)}
                                        disabled={feed.category_id === cat.id}
                                      >
                                        <Folder className="mr-2 h-4 w-4" />
                                        {cat.title}
                                      </ContextMenuItem>
                                    ))}
                                  </ContextMenuSubContent>
                                </ContextMenuSub>
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                  onClick={() => handleUnsubscribe(feed)}
                                  variant="destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Unsubscribe
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                } else {
                  const feed = item.data
                  return (
                    <ContextMenu key={`feed-${feed.id}`}>
                      <ContextMenuTrigger asChild>
                        <SortableItem
                          id={`feed-${feed.id}`}
                          isSelected={selectedId === `feed-${feed.id}`}
                          isEditing={editingId === `feed-${feed.id}`}
                          editValue={editValue}
                          onEditChange={setEditValue}
                          onEditSave={saveEdit}
                          onSelect={() => setSelectedId(`feed-${feed.id}`)}
                        >
                          {refreshingFeedId === feed.id ? (
                            <RefreshCw className="h-4 w-4 mr-2 shrink-0 animate-spin" />
                          ) : feed.icon_url ? (
                            <img
                              src={feed.icon_url}
                              className="h-4 w-4 mr-2 shrink-0"
                              alt=""
                            />
                          ) : (
                            <Rss className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
                          )}
                          <span className="flex-1 truncate">{feed.title}</span>
                          <NextSyncIndicator feed={feed} />
                          {feed.last_error && (
                            <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
                          )}
                        </SortableItem>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem
                          onClick={() => handleRefreshFeed(feed)}
                          disabled={refreshingFeedId === feed.id}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Sync Now
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => setEditFeed(feed)}>
                          <Settings className="mr-2 h-4 w-4" />
                          Edit Feed...
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => setInfoFeed(feed)}>
                          <Info className="mr-2 h-4 w-4" />
                          Feed Info...
                        </ContextMenuItem>
                        <ContextMenuSub>
                          <ContextMenuSubTrigger>
                            <FolderInput className="mr-2 h-4 w-4" />
                            Move to...
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent>
                            <ContextMenuItem
                              onClick={() => handleMoveFeed(feed, null)}
                              disabled={feed.category_id === null}
                            >
                              <Rss className="mr-2 h-4 w-4" />
                              Uncategorized
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            {categories.map((cat) => (
                              <ContextMenuItem
                                key={cat.id}
                                onClick={() => handleMoveFeed(feed, cat.id)}
                                disabled={feed.category_id === cat.id}
                              >
                                <Folder className="mr-2 h-4 w-4" />
                                {cat.title}
                              </ContextMenuItem>
                            ))}
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onClick={() => handleUnsubscribe(feed)}
                          variant="destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Unsubscribe
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  )
                }
              })}
            </div>
          </SortableContext>

          <DragOverlay modifiers={[snapCenterToCursor]}>
            {activeId && (
              <div className="flex items-center gap-2 px-3 py-2 bg-background border rounded-md shadow-lg">
                {activeId.startsWith("category-") ? (
                  <Folder className="h-4 w-4" />
                ) : (
                  <Rss className="h-4 w-4" />
                )}
                <span className="text-sm">
                  {activeId.startsWith("category-")
                    ? categories.find(
                        (c) =>
                          c.id ===
                          parseInt(activeId.replace("category-", ""), 10)
                      )?.title
                    : feeds.find(
                        (f) =>
                          f.id === parseInt(activeId.replace("feed-", ""), 10)
                      )?.title}
                </span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </ScrollArea>

      <CommandPalette
        open={showQuickMove}
        onOpenChange={setShowQuickMove}
        placeholder="Move to category..."
        categories={categories}
        onSelectCategory={handleQuickMove}
        mode="move"
      />

      <FeedInfoDialog
        open={infoFeed !== null}
        onOpenChange={(open) => {
          if (!open) setInfoFeed(null)
        }}
        feed={infoFeed}
      />

      <EditFeedDialog
        feed={editFeed}
        open={editFeed !== null}
        onOpenChange={(open) => {
          if (!open) setEditFeed(null)
        }}
        categories={categories}
        onFeedUpdated={handleFeedUpdated}
        onFeedDeleted={handleFeedDeleted}
      />
    </div>
  )
}

interface SortableItemProps extends React.HTMLAttributes<HTMLDivElement> {
  id: string
  isSelected: boolean
  isEditing: boolean
  editValue: string
  onEditChange: (value: string) => void
  onEditSave: () => void
  onSelect: () => void
  onToggle?: () => void
  children: React.ReactNode
}

const SortableItem = forwardRef<HTMLDivElement, SortableItemProps>(
  function SortableItem(
    {
      id,
      isSelected,
      isEditing,
      editValue,
      onEditChange,
      onEditSave,
      onSelect,
      onToggle,
      children,
      ...restProps
    },
    forwardedRef
  ) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id })

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        onEditSave()
      }
      if (e.key === "Escape") {
        e.preventDefault()
        onEditSave()
      }
    }

    // Combine both refs (sortable and forwarded)
    const combinedRef = (node: HTMLDivElement | null) => {
      setNodeRef(node)
      if (typeof forwardedRef === "function") {
        forwardedRef(node)
      } else if (forwardedRef) {
        forwardedRef.current = node
      }
    }

    return (
      <div
        ref={combinedRef}
        style={style}
        className={cn(
          "flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer group",
          isSelected && "bg-accent",
          isDragging && "ring-2 ring-ring"
        )}
        onClick={onSelect}
        onDoubleClick={onToggle}
        role="option"
        aria-selected={isSelected}
        {...restProps}
      >
        <button
          className="touch-none opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        {isEditing ? (
          <Input
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={onEditSave}
            onKeyDown={handleKeyDown}
            className="h-7 flex-1"
            autoFocus
          />
        ) : (
          <div className="flex items-center flex-1 min-w-0">{children}</div>
        )}
      </div>
    )
  }
)
