import { useCallback, useMemo } from "react"
import { Category, Feed } from "@/lib/api"
import { stepCategory, visibleCategoryIds } from "@/lib/categoryNavigation"

export interface CategoryNavigationOptions {
  categories: Category[]
  feeds: Feed[]
  selectedCategoryId: number | null
  selectedFeedId: number | null
  /**
   * The reader's hide-read setting, the same boolean FeedSidebar filters its
   * rows with. Defaults to false, which makes every category navigable.
   */
  hideReadFeeds?: boolean
  /** Move the sidebar selection to this category. */
  onSelectCategory: (categoryId: number) => void
  /**
   * Called instead of `onSelectCategory` when there is no category in that
   * direction. `categoryId` is the category the reader is parked on, or null
   * when nothing is selected and the tree is empty.
   */
  onBoundary: (direction: "next" | "previous", categoryId: number | null) => void
}

export interface CategoryNavigation {
  /** The category the next step is measured from. */
  currentCategoryId: number | null
  selectNextCategory: () => void
  selectPreviousCategory: () => void
}

/**
 * Shift+J / Shift+K: move the sidebar selection one category down or up.
 *
 * The position is taken from the sidebar selection, not from the entry list.
 * A selected feed counts as its own category being current, so Shift+J from a
 * single feed lands on the category after the one that feed lives in rather
 * than on the feed's own category.
 *
 * This replaces a pair of handlers that scanned the loaded entry list for the
 * next entry whose feed sat in a different category (ttrb-s4mr). That is a
 * different action from the one the shortcut is named for, and in any view
 * already scoped to one category - a feed, a category, a tag - every entry
 * matched the current one, the scan fell out of the bottom of its loop, and
 * nothing on screen moved or said why.
 *
 * Only categories the sidebar is drawing are visited. The set comes from
 * `visibleCategoryIds`, which FeedSidebar's own render also filters on, so the
 * two cannot disagree about what is on screen. Collapsed folders are still
 * walked; see that function for why hiding and folding are treated differently.
 */
export function useCategoryNavigation({
  categories,
  feeds,
  selectedCategoryId,
  selectedFeedId,
  hideReadFeeds = false,
  onSelectCategory,
  onBoundary,
}: CategoryNavigationOptions): CategoryNavigation {
  const currentCategoryId = useMemo(() => {
    if (selectedCategoryId !== null) return selectedCategoryId
    if (selectedFeedId !== null) {
      return feeds.find((feed) => feed.id === selectedFeedId)?.category_id ?? null
    }
    return null
  }, [selectedCategoryId, selectedFeedId, feeds])

  const visibleIds = useMemo(
    () => visibleCategoryIds(categories, feeds, hideReadFeeds),
    [categories, feeds, hideReadFeeds]
  )

  const step = useCallback(
    (direction: "next" | "previous") => {
      const targetId = stepCategory(categories, currentCategoryId, direction, visibleIds)
      if (targetId !== null) {
        onSelectCategory(targetId)
        return
      }
      onBoundary(direction, currentCategoryId)
    },
    [categories, currentCategoryId, visibleIds, onSelectCategory, onBoundary]
  )

  const selectNextCategory = useCallback(() => step("next"), [step])
  const selectPreviousCategory = useCallback(() => step("previous"), [step])

  return { currentCategoryId, selectNextCategory, selectPreviousCategory }
}
