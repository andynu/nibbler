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

function feed(id: number, title: string, categoryId: number | null): Feed {
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
    unread_count: 0,
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
})
