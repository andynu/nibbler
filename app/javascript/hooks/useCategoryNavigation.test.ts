import { renderHook } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { Category, Feed } from "@/lib/api"
import { useCategoryNavigation, CategoryNavigationOptions } from "./useCategoryNavigation"

function category(
  id: number,
  title: string,
  parentId: number | null = null,
  orderId = 0
): Category {
  return {
    id,
    title,
    parent_id: parentId,
    collapsed: false,
    order_id: orderId,
    feed_count: 0,
    unread_count: 0,
  }
}

function feed(
  id: number,
  title: string,
  categoryId: number | null,
  unreadCount = 0
): Feed {
  return {
    id,
    title,
    feed_url: `https://example.com/${id}.xml`,
    site_url: null,
    category_id: categoryId,
    category_title: null,
    icon_url: null,
    last_updated: null,
    last_successful_update: null,
    next_poll_at: null,
    last_error: null,
    unread_count: unreadCount,
    entry_count: 0,
    oldest_entry_date: null,
    newest_entry_date: null,
  }
}

/** Technology > Programming, then Science - the tree E2eDataset seeds. */
const CATEGORIES = [
  category(1, "Technology", null, 0),
  category(2, "Programming", 1, 1),
  category(3, "Science", null, 2),
]

const FEEDS = [
  feed(10, "Rust Weekly", 2),
  feed(11, "Deep Space", 3),
  feed(12, "Field Notes", null),
]

describe("useCategoryNavigation", () => {
  const onSelectCategory = vi.fn()
  const onBoundary = vi.fn()

  beforeEach(() => {
    onSelectCategory.mockClear()
    onBoundary.mockClear()
  })

  function setup(overrides: Partial<CategoryNavigationOptions> = {}) {
    return renderHook(() =>
      useCategoryNavigation({
        categories: CATEGORIES,
        feeds: FEEDS,
        selectedCategoryId: null,
        selectedFeedId: null,
        onSelectCategory,
        onBoundary,
        ...overrides,
      })
    )
  }

  describe("where the current position comes from", () => {
    it("uses the selected category", () => {
      const { result } = setup({ selectedCategoryId: 2 })

      expect(result.current.currentCategoryId).toBe(2)
    })

    it("uses the selected feed's category when no category is selected", () => {
      const { result } = setup({ selectedFeedId: 10 })

      expect(result.current.currentCategoryId).toBe(2)
    })

    it("prefers the selected category over a stale feed selection", () => {
      const { result } = setup({ selectedCategoryId: 3, selectedFeedId: 10 })

      expect(result.current.currentCategoryId).toBe(3)
    })

    it("has no position on an uncategorized feed", () => {
      const { result } = setup({ selectedFeedId: 12 })

      expect(result.current.currentCategoryId).toBeNull()
    })

    it("has no position in a virtual folder", () => {
      const { result } = setup()

      expect(result.current.currentCategoryId).toBeNull()
    })
  })

  describe("selectNextCategory", () => {
    it("selects the first category when nothing is selected", () => {
      const { result } = setup()

      result.current.selectNextCategory()

      expect(onSelectCategory).toHaveBeenCalledWith(1)
      expect(onBoundary).not.toHaveBeenCalled()
    })

    it("moves the sidebar selection from a category to the next one", () => {
      const { result } = setup({ selectedCategoryId: 1 })

      result.current.selectNextCategory()

      expect(onSelectCategory).toHaveBeenCalledWith(2)
    })

    // The bug this hook replaces: a view scoped to one category had every entry
    // in that category, so the old entry-list scan never found a different one
    // and nothing happened at all.
    it("moves out of a single-category view instead of doing nothing", () => {
      const { result } = setup({ selectedCategoryId: 2 })

      result.current.selectNextCategory()

      expect(onSelectCategory).toHaveBeenCalledWith(3)
      expect(onBoundary).not.toHaveBeenCalled()
    })

    it("moves out of a single-feed view to the category after that feed's own", () => {
      const { result } = setup({ selectedFeedId: 10 })

      result.current.selectNextCategory()

      expect(onSelectCategory).toHaveBeenCalledWith(3)
    })

    it("reports a boundary at the last category rather than wrapping", () => {
      const { result } = setup({ selectedCategoryId: 3 })

      result.current.selectNextCategory()

      expect(onSelectCategory).not.toHaveBeenCalled()
      expect(onBoundary).toHaveBeenCalledWith("next", 3)
    })

    it("reports a boundary with no category when the tree is empty", () => {
      const { result } = setup({ categories: [] })

      result.current.selectNextCategory()

      expect(onSelectCategory).not.toHaveBeenCalled()
      expect(onBoundary).toHaveBeenCalledWith("next", null)
    })
  })

  describe("selectPreviousCategory", () => {
    it("selects the last category when nothing is selected", () => {
      const { result } = setup()

      result.current.selectPreviousCategory()

      expect(onSelectCategory).toHaveBeenCalledWith(3)
    })

    it("moves the sidebar selection back one category", () => {
      const { result } = setup({ selectedCategoryId: 3 })

      result.current.selectPreviousCategory()

      expect(onSelectCategory).toHaveBeenCalledWith(2)
    })

    it("reports a boundary at the first category rather than wrapping", () => {
      const { result } = setup({ selectedCategoryId: 1 })

      result.current.selectPreviousCategory()

      expect(onSelectCategory).not.toHaveBeenCalled()
      expect(onBoundary).toHaveBeenCalledWith("previous", 1)
    })

    it("reports a boundary with no category when the tree is empty", () => {
      const { result } = setup({ categories: [] })

      result.current.selectPreviousCategory()

      expect(onBoundary).toHaveBeenCalledWith("previous", null)
    })
  })

  it("never both selects and reports a boundary for one press", () => {
    const { result } = setup({ selectedCategoryId: 3 })

    result.current.selectNextCategory()

    expect(onSelectCategory.mock.calls.length + onBoundary.mock.calls.length).toBe(1)
  })

  // Andy, after ttrb-s4mr landed: "when the only show unread categories is
  // selected, those keys still navigate to hidden categories." The sidebar
  // decided which categories had rows inside its own render, so nothing else
  // could ask, and Shift+J walked through rows that were never painted.
  describe("with hide-read on", () => {
    /** Only Science has anything unread, so only Science has a row. */
    const SCIENCE_ONLY = [
      feed(10, "Rust Weekly", 2, 0),
      feed(11, "Deep Space", 3, 6),
      feed(12, "Field Notes", null, 4),
    ]

    /** Programming has unread, which is what gives Technology its row. */
    const PROGRAMMING_ONLY = [
      feed(10, "Rust Weekly", 2, 2),
      feed(11, "Deep Space", 3, 0),
    ]

    it("skips a category whose feeds are all read", () => {
      const { result } = setup({ hideReadFeeds: true, feeds: SCIENCE_ONLY })

      result.current.selectNextCategory()

      expect(onSelectCategory).toHaveBeenCalledWith(3)
    })

    it("skips a category hidden only because its children have nothing unread", () => {
      // Technology owns no feeds at all. Its row exists only when Programming's
      // does, so with Programming read it is not on screen either.
      const { result } = setup({ hideReadFeeds: true, feeds: SCIENCE_ONLY })

      result.current.selectNextCategory()

      expect(onSelectCategory).not.toHaveBeenCalledWith(1)
    })

    it("visits a parent with no feeds of its own when a child has unread", () => {
      const { result } = setup({ hideReadFeeds: true, feeds: PROGRAMMING_ONLY })

      result.current.selectNextCategory()

      expect(onSelectCategory).toHaveBeenCalledWith(1)
    })

    it("reports a boundary at the last visible category instead of stepping into a hidden one", () => {
      const { result } = setup({
        hideReadFeeds: true,
        feeds: PROGRAMMING_ONLY,
        selectedCategoryId: 2,
      })

      result.current.selectNextCategory()

      expect(onSelectCategory).not.toHaveBeenCalled()
      expect(onBoundary).toHaveBeenCalledWith("next", 2)
    })

    it("reports a boundary going back past the first visible category", () => {
      const { result } = setup({
        hideReadFeeds: true,
        feeds: SCIENCE_ONLY,
        selectedCategoryId: 3,
      })

      result.current.selectPreviousCategory()

      expect(onSelectCategory).not.toHaveBeenCalled()
      expect(onBoundary).toHaveBeenCalledWith("previous", 3)
    })

    it("reports a boundary when hide-read has emptied the sidebar", () => {
      const { result } = setup({
        hideReadFeeds: true,
        feeds: [feed(10, "Rust Weekly", 2, 0), feed(11, "Deep Space", 3, 0)],
      })

      result.current.selectNextCategory()

      expect(onSelectCategory).not.toHaveBeenCalled()
      expect(onBoundary).toHaveBeenCalledWith("next", null)
    })

    // The reader marks the last article in the category they are sitting in,
    // and its row goes. The next press moves one step from where that row was,
    // rather than treating the selection as lost and jumping to the top.
    it("steps on from the category that just disappeared under the reader", () => {
      const { result } = setup({
        hideReadFeeds: true,
        feeds: SCIENCE_ONLY,
        selectedCategoryId: 2,
      })

      result.current.selectNextCategory()

      expect(onSelectCategory).toHaveBeenCalledWith(3)
    })

    it("leaves navigation alone when hide-read is off", () => {
      const { result } = setup({ hideReadFeeds: false, feeds: SCIENCE_ONLY })

      result.current.selectNextCategory()

      expect(onSelectCategory).toHaveBeenCalledWith(1)
    })

    it("changes what is reachable the moment hide-read is toggled, with no reload", () => {
      const { result, rerender } = renderHook(
        ({ hideReadFeeds }: { hideReadFeeds: boolean }) =>
          useCategoryNavigation({
            categories: CATEGORIES,
            feeds: SCIENCE_ONLY,
            selectedCategoryId: null,
            selectedFeedId: null,
            hideReadFeeds,
            onSelectCategory,
            onBoundary,
          }),
        { initialProps: { hideReadFeeds: false } }
      )

      result.current.selectNextCategory()
      expect(onSelectCategory).toHaveBeenLastCalledWith(1)

      rerender({ hideReadFeeds: true })

      result.current.selectNextCategory()
      expect(onSelectCategory).toHaveBeenLastCalledWith(3)
    })
  })
})
