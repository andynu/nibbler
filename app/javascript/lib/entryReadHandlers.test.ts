import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Category, Entry, Feed } from "@/lib/api"
import type { SearchResultPatch } from "@/hooks/useEntrySearch"

const mockToggleRead = vi.fn()
const mockMarkAllRead = vi.fn()
const mockCountersGet = vi.fn()
const mockFeedsList = vi.fn()
const mockCategoriesList = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    entries: {
      toggleRead: (...args: unknown[]) => mockToggleRead(...args),
      markAllRead: (...args: unknown[]) => mockMarkAllRead(...args),
    },
    counters: { get: (...args: unknown[]) => mockCountersGet(...args) },
    feeds: { list: (...args: unknown[]) => mockFeedsList(...args) },
    categories: { list: (...args: unknown[]) => mockCategoriesList(...args) },
  },
}))

import { api } from "@/lib/api"
import { applyUnreadCounts } from "./unreadCounts"
import { markAllEntriesRead, toggleEntryRead } from "./entryReadHandlers"

function entry(id: number, feed_id: number, unread: boolean): Entry {
  return {
    id,
    entry_id: id,
    feed_id,
    feed_title: "Feed",
    title: `Entry ${id}`,
    link: `https://example.com/${id}`,
    author: "",
    published: "2026-11-20T00:00:00Z",
    unread,
    starred: false,
    is_published: false,
    score: 0,
    last_read: null,
  }
}

function feed(id: number, category_id: number, unread_count: number): Feed {
  return { id, title: `Feed ${id}`, category_id, unread_count } as Feed
}

function category(id: number, unread_count: number): Category {
  return { id, title: `Category ${id}`, parent_id: null, unread_count } as Category
}

/**
 * Stands in for App's state and the writers it hands the handlers. The
 * loadCounters here does what App's does: one GET /counters, overlaid onto
 * the feeds and categories already in hand.
 */
function app() {
  const state = {
    entries: [entry(10, 1, true), entry(11, 1, true), entry(12, 2, true)],
    feeds: [feed(1, 100, 2), feed(2, 100, 1)],
    categories: [category(100, 3)],
    search: new Map<number, SearchResultPatch>(),
  }
  const patchEntry = (entryId: number, patch: Partial<Entry>) => {
    state.entries = state.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e))
  }
  const updateSearchResult = (entryId: number, patch: SearchResultPatch) => {
    state.search.set(entryId, patch)
  }
  const loadCounters = async () => {
    const result = await api.counters.get()
    state.feeds = applyUnreadCounts(state.feeds, result.feeds)
    state.categories = applyUnreadCounts(state.categories, result.categories)
  }
  const markLoadedRead = () => {
    state.entries = state.entries.map((e) => ({ ...e, unread: false }))
  }
  return { state, patchEntry, updateSearchResult, loadCounters, markLoadedRead }
}

describe("toggleEntryRead", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockToggleRead.mockResolvedValue({ id: 10, unread: false })
    mockCountersGet.mockResolvedValue({
      feeds: { 1: 1, 2: 1 },
      categories: { 100: 2 },
      virtual: { all: 2, fresh: 2, starred: 0, published: 0 },
      total: 2,
    })
  })

  it("writes the new read state to the list row and the search hit", async () => {
    const a = app()

    await toggleEntryRead(10, a)

    expect(mockToggleRead).toHaveBeenCalledWith(10)
    expect(a.state.entries.find((e) => e.id === 10)?.unread).toBe(false)
    expect(a.state.search.get(10)).toEqual({ unread: false })
  })

  it("moves the feed and category badges off the counters response", async () => {
    const a = app()

    await toggleEntryRead(10, a)

    // loadCounters is fired, not awaited, same as in App.
    await vi.waitFor(() => {
      expect(a.state.feeds.map((f) => f.unread_count)).toEqual([1, 1])
      expect(a.state.categories[0].unread_count).toBe(2)
    })
  })

  it("does not reload the feed or category lists", async () => {
    await toggleEntryRead(10, app())

    expect(mockFeedsList).not.toHaveBeenCalled()
    expect(mockCategoriesList).not.toHaveBeenCalled()
  })

  it("returns the server's read state", async () => {
    mockToggleRead.mockResolvedValue({ id: 10, unread: true })

    await expect(toggleEntryRead(10, app())).resolves.toBe(true)
  })

  it("rethrows a failed toggle without touching state", async () => {
    mockToggleRead.mockRejectedValue(new Error("boom"))
    const a = app()

    await expect(toggleEntryRead(10, a)).rejects.toThrow("boom")
    expect(a.state.entries.every((e) => e.unread)).toBe(true)
    expect(mockCountersGet).not.toHaveBeenCalled()
  })
})

describe("markAllEntriesRead", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMarkAllRead.mockResolvedValue({ marked_read: 2 })
    mockCountersGet.mockResolvedValue({
      feeds: { 2: 1 },
      categories: { 100: 1 },
      virtual: { all: 1, fresh: 1, starred: 0, published: 0 },
      total: 1,
    })
  })

  it("sends the scope and clears the loaded rows", async () => {
    const a = app()

    await markAllEntriesRead({ feed_id: 1 }, a)

    expect(mockMarkAllRead).toHaveBeenCalledWith({ feed_id: 1 })
    expect(a.state.entries.every((e) => !e.unread)).toBe(true)
  })

  it("zeroes the swept feed's badge and lowers its category's", async () => {
    // The counters map omits a feed with nothing unread; absence is the zero.
    const a = app()

    await markAllEntriesRead({ feed_id: 1 }, a)

    await vi.waitFor(() => {
      expect(a.state.feeds.map((f) => f.unread_count)).toEqual([0, 1])
      expect(a.state.categories[0].unread_count).toBe(1)
    })
  })

  it("does not reload the feed or category lists", async () => {
    await markAllEntriesRead({ category_id: 100 }, app())

    expect(mockFeedsList).not.toHaveBeenCalled()
    expect(mockCategoriesList).not.toHaveBeenCalled()
  })
})
