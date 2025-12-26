import { useState, useEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Rss, Folder, ChevronRight, ChevronDown, RefreshCw, Star, Clock, Send } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Feed, Category } from "@/lib/api"

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
}: FeedSidebarProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(
    new Set(categories.map((c) => c.id))
  )

  useEffect(() => {
    setExpandedCategories(new Set(categories.map((c) => c.id)))
  }, [categories])

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

  const uncategorizedFeeds = feeds.filter((f) => !f.category_id)
  const totalUnread = feeds.reduce((sum, f) => sum + f.unread_count, 0)

  return (
    <div className="h-full flex flex-col border-r border-border bg-muted/30">
      <div className="h-12 px-3 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Rss className="h-5 w-5" />
          <span className="font-semibold">TTRB</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onRefreshAll} disabled={isRefreshing}>
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start gap-2 mb-1",
              !selectedFeedId && !selectedCategoryId && !virtualFeed && "bg-accent"
            )}
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
            className={cn("w-full justify-start gap-2 mb-1", virtualFeed === "fresh" && "bg-accent")}
            onClick={() => onSelectVirtualFeed("fresh")}
          >
            <Clock className="h-4 w-4" />
            <span className="flex-1 text-left">Fresh</span>
          </Button>

          <Button
            variant="ghost"
            className={cn("w-full justify-start gap-2 mb-1", virtualFeed === "starred" && "bg-accent")}
            onClick={() => onSelectVirtualFeed("starred")}
          >
            <Star className="h-4 w-4" />
            <span className="flex-1 text-left">Starred</span>
          </Button>

          <Button
            variant="ghost"
            className={cn("w-full justify-start gap-2 mb-1", virtualFeed === "published" && "bg-accent")}
            onClick={() => onSelectVirtualFeed("published")}
          >
            <Send className="h-4 w-4" />
            <span className="flex-1 text-left">Published</span>
          </Button>

          <div className="h-px bg-border my-2" />

          {categories.map((category) => (
            <CategoryItem
              key={category.id}
              category={category}
              feeds={feeds.filter((f) => f.category_id === category.id)}
              isExpanded={expandedCategories.has(category.id)}
              selectedFeedId={selectedFeedId}
              selectedCategoryId={selectedCategoryId}
              onToggle={() => toggleCategory(category.id)}
              onSelectFeed={onSelectFeed}
              onSelectCategory={onSelectCategory}
            />
          ))}

          {uncategorizedFeeds.length > 0 && (
            <>
              <div className="h-px bg-border my-2" />
              {uncategorizedFeeds.map((feed) => (
                <FeedItem
                  key={feed.id}
                  feed={feed}
                  isSelected={selectedFeedId === feed.id}
                  onSelect={() => onSelectFeed(feed.id)}
                />
              ))}
            </>
          )}
        </div>
      </ScrollArea>
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
}: CategoryItemProps) {
  const unreadCount = feeds.reduce((sum, f) => sum + f.unread_count, 0)

  return (
    <div>
      <div className="flex items-center">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onToggle}>
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          className={cn(
            "flex-1 justify-start gap-2 h-8",
            selectedCategoryId === category.id && "bg-accent"
          )}
          onClick={() => onSelectCategory(category.id)}
        >
          <Folder className="h-4 w-4" />
          <span className="flex-1 text-left truncate">{category.title}</span>
          {unreadCount > 0 && <Badge variant="secondary">{unreadCount}</Badge>}
        </Button>
      </div>
      {isExpanded && (
        <div className="ml-6">
          {feeds.map((feed) => (
            <FeedItem
              key={feed.id}
              feed={feed}
              isSelected={selectedFeedId === feed.id}
              onSelect={() => onSelectFeed(feed.id)}
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
}

function FeedItem({ feed, isSelected, onSelect }: FeedItemProps) {
  return (
    <Button
      variant="ghost"
      className={cn("w-full justify-start gap-2 h-8", isSelected && "bg-accent")}
      onClick={onSelect}
    >
      {feed.icon_url ? (
        <img src={feed.icon_url} className="h-4 w-4" alt="" />
      ) : (
        <Rss className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="flex-1 text-left truncate">{feed.title}</span>
      {feed.unread_count > 0 && <Badge variant="secondary">{feed.unread_count}</Badge>}
    </Button>
  )
}
