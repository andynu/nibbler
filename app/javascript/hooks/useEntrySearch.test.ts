import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { api } from "@/lib/api"
import type { SearchResponse } from "@/lib/api"
import { useEntrySearch, SEARCH_DEBOUNCE_MS } from "./useEntrySearch"
import { mockSearchResponse, mockSearchResult } from "../../../test/fixtures/data"

vi.mock("@/lib/api", () => ({
  api: { search: vi.fn() },
}))

const search = vi.mocked(api.search)

/** A promise whose settlement this test controls, to force response ordering. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Run the debounce out and let any resulting promise callbacks land. */
async function settle(ms: number = SEARCH_DEBOUNCE_MS) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

describe("useEntrySearch", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    search.mockReset()
    // A hit by default. An empty response makes the hook go back for the
    // outside-the-scope count, which would show up as a second call in every
    // test that is only interested in the first one.
    search.mockResolvedValue(mockSearchResponse([mockSearchResult()]))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts idle with no query and no request", async () => {
    const { result } = renderHook(() => useEntrySearch())

    expect(result.current.query).toBe("")
    expect(result.current.isActive).toBe(false)
    expect(result.current.results).toEqual([])

    await settle(5000)
    expect(search).not.toHaveBeenCalled()
  })

  describe("debounce", () => {
    it("holds the request until the debounce elapses", async () => {
      const { result } = renderHook(() => useEntrySearch())

      act(() => result.current.setQuery("rails"))
      await settle(SEARCH_DEBOUNCE_MS - 1)
      expect(search).not.toHaveBeenCalled()

      await settle(1)
      expect(search).toHaveBeenCalledTimes(1)
    })

    it("collapses rapid typing into one request for the final query", async () => {
      const { result } = renderHook(() => useEntrySearch())

      for (const partial of ["r", "ra", "rai", "rail", "rails"]) {
        act(() => result.current.setQuery(partial))
        await settle(50)
      }
      await settle()

      expect(search).toHaveBeenCalledTimes(1)
      expect(search).toHaveBeenCalledWith(expect.objectContaining({ q: "rails" }))
    })

    it("reports isSearching from the first keystroke until the response lands", async () => {
      const pending = deferred<SearchResponse>()
      search.mockReturnValue(pending.promise)
      const { result } = renderHook(() => useEntrySearch())

      act(() => result.current.setQuery("rails"))
      expect(result.current.isSearching).toBe(true)

      await settle()
      expect(result.current.isSearching).toBe(true)

      await act(async () => {
        pending.resolve(mockSearchResponse([mockSearchResult()]))
      })
      expect(result.current.isSearching).toBe(false)
    })
  })

  describe("empty query", () => {
    it("never sends a request for a blank or whitespace-only query", async () => {
      const { result } = renderHook(() => useEntrySearch())

      act(() => result.current.setQuery("   "))
      await settle(5000)

      expect(search).not.toHaveBeenCalled()
      expect(result.current.isActive).toBe(false)
    })

    it("drops back to the unfiltered list when the box is emptied", async () => {
      search.mockResolvedValue(mockSearchResponse([mockSearchResult({ title: "A hit" })]))
      const { result } = renderHook(() => useEntrySearch())

      act(() => result.current.setQuery("rails"))
      await settle()
      expect(result.current.results).toHaveLength(1)

      act(() => result.current.clear())
      expect(result.current.results).toEqual([])
      expect(result.current.isActive).toBe(false)
      expect(result.current.isSearching).toBe(false)

      await settle(5000)
      expect(search).toHaveBeenCalledTimes(1)
    })

    it("abandons an in-flight request when the box is emptied", async () => {
      const pending = deferred<SearchResponse>()
      search.mockReturnValue(pending.promise)
      const { result } = renderHook(() => useEntrySearch())

      act(() => result.current.setQuery("rails"))
      await settle()

      act(() => result.current.clear())
      await act(async () => {
        pending.resolve(mockSearchResponse([mockSearchResult({ title: "Too late" })]))
      })

      expect(result.current.results).toEqual([])
    })
  })

  describe("out-of-order responses", () => {
    it("keeps the newer results when an older response settles last", async () => {
      const first = deferred<SearchResponse>()
      const second = deferred<SearchResponse>()
      search.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      const { result } = renderHook(() => useEntrySearch())

      act(() => result.current.setQuery("rai"))
      await settle()
      act(() => result.current.setQuery("rails"))
      await settle()
      expect(search).toHaveBeenCalledTimes(2)

      await act(async () => {
        second.resolve(mockSearchResponse([mockSearchResult({ id: 2, title: "rails hit" })]))
      })
      await act(async () => {
        first.resolve(mockSearchResponse([mockSearchResult({ id: 1, title: "rai hit" })]))
      })

      expect(result.current.results.map((r) => r.title)).toEqual(["rails hit"])
    })

    it("discards a response whose query has already been typed past", async () => {
      const pending = deferred<SearchResponse>()
      search.mockReturnValue(pending.promise)
      const { result } = renderHook(() => useEntrySearch())

      act(() => result.current.setQuery("rai"))
      await settle()

      // Still in flight when the next keystroke arrives.
      act(() => result.current.setQuery("rails"))
      await act(async () => {
        pending.resolve(mockSearchResponse([mockSearchResult({ title: "rai hit" })]))
      })

      expect(result.current.results).toEqual([])
      expect(result.current.isSearching).toBe(true)
    })
  })

  describe("scope inherited from the list", () => {
    it("sends the feed and category the list is currently showing", async () => {
      const { result } = renderHook(() => useEntrySearch({ feed_id: 7, category_id: 3 }))

      act(() => result.current.setQuery("rails"))
      await settle()

      expect(search).toHaveBeenCalledWith({ q: "rails", feed_id: 7, category_id: 3 })
    })

    it("sends nothing but the query when the list narrows nothing", async () => {
      const { result } = renderHook(() => useEntrySearch({}))

      act(() => result.current.setQuery("rails"))
      await settle()

      expect(search).toHaveBeenCalledWith({ q: "rails" })
    })

    it("carries the tag filter, which the list applies too", async () => {
      const { result } = renderHook(() => useEntrySearch({ tag: "ruby" }))

      act(() => result.current.setQuery("rails"))
      await settle()

      expect(search).toHaveBeenCalledWith({ q: "rails", tag: "ruby" })
    })

    it("carries the list's unread filter, so a read article cannot match", async () => {
      const { result } = renderHook(() => useEntrySearch({ unread: true }))

      act(() => result.current.setQuery("rails"))
      await settle()

      expect(search).toHaveBeenCalledWith({ q: "rails", unread: true })
    })

    it("re-runs the query when the list moves under it", async () => {
      const { result, rerender } = renderHook(
        ({ feedId }: { feedId: number }) => useEntrySearch({ feed_id: feedId }),
        { initialProps: { feedId: 7 } }
      )

      act(() => result.current.setQuery("rails"))
      await settle()
      expect(search).toHaveBeenCalledTimes(1)

      rerender({ feedId: 9 })
      await settle()

      expect(search).toHaveBeenCalledTimes(2)
      expect(search).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "rails", feed_id: 9 })
      )
    })
  })

  describe("Fresh", () => {
    const freshList = {
      view: "fresh" as const,
      fresh_max_age: "month" as const,
      fresh_per_feed: 5,
    }

    it("sends the view, the max age and the per-feed cap together", async () => {
      const { result } = renderHook(() => useEntrySearch(freshList))

      act(() => result.current.setQuery("rails"))
      await settle()

      // All three or none: view alone would fall back to the server's default
      // window and no cap, quietly searching wider than the list shown.
      expect(search).toHaveBeenCalledWith({
        q: "rails",
        view: "fresh",
        fresh_max_age: "month",
        fresh_per_feed: 5,
      })
    })

    it("drops all three when the reader asks for deeper history", async () => {
      const { result } = renderHook(() => useEntrySearch(freshList))

      act(() => result.current.setQuery("rails"))
      await settle()
      act(() => result.current.setHistory("all"))
      await settle()

      // view: "fresh" IS unread plus an age cutoff server-side, so keeping it
      // here would hand back an unread-only result set under a control that
      // claims to have widened.
      expect(search).toHaveBeenLastCalledWith({ q: "rails" })
    })

    it("keeps the Fresh window when only the place is widened", async () => {
      const { result } = renderHook(() =>
        useEntrySearch({ ...freshList, feed_id: 7 })
      )

      act(() => result.current.setQuery("rails"))
      await settle()
      act(() => result.current.setPlace("everything"))
      await settle()

      expect(search).toHaveBeenLastCalledWith({
        q: "rails",
        view: "fresh",
        fresh_max_age: "month",
        fresh_per_feed: 5,
      })
    })

    it("offers deeper history but not a wider place, which Fresh does not narrow", () => {
      const { result } = renderHook(() => useEntrySearch(freshList))

      expect(result.current.canWidenHistory).toBe(true)
      expect(result.current.canWidenPlace).toBe(false)
    })
  })

  describe("widening the place", () => {
    const list = { feed_id: 7, tag: "ruby", unread: true }

    it("drops the feed and tag but keeps the read-state window", async () => {
      const { result } = renderHook(() => useEntrySearch(list))

      act(() => result.current.setQuery("rails"))
      await settle()
      expect(search).toHaveBeenCalledWith({
        q: "rails",
        feed_id: 7,
        tag: "ruby",
        unread: true,
      })

      act(() => result.current.setPlace("everything"))
      await settle()

      expect(search).toHaveBeenLastCalledWith({ q: "rails", unread: true })
    })

    it("drops a place view without touching the history axis", async () => {
      const { result } = renderHook(() =>
        useEntrySearch({ view: "starred", unread: true })
      )

      act(() => result.current.setQuery("rails"))
      await settle()
      act(() => result.current.setPlace("everything"))
      await settle()

      expect(search).toHaveBeenLastCalledWith({ q: "rails", unread: true })
    })

    it("goes back to the list scope when narrowed again", async () => {
      const { result } = renderHook(() => useEntrySearch(list))

      act(() => result.current.setQuery("rails"))
      await settle()
      act(() => result.current.setPlace("everything"))
      await settle()
      act(() => result.current.setPlace("list"))
      await settle()

      expect(search).toHaveBeenLastCalledWith({
        q: "rails",
        feed_id: 7,
        tag: "ruby",
        unread: true,
      })
    })
  })

  describe("widening the history", () => {
    it("drops unread but keeps the feed the reader is standing in", async () => {
      const { result } = renderHook(() => useEntrySearch({ feed_id: 7, unread: true }))

      act(() => result.current.setQuery("rails"))
      await settle()
      act(() => result.current.setHistory("all"))
      await settle()

      expect(search).toHaveBeenLastCalledWith({ q: "rails", feed_id: 7 })
    })

    it("drops the archived view, which is a read-state filter of its own", async () => {
      const { result } = renderHook(() => useEntrySearch({ view: "archived" }))

      act(() => result.current.setQuery("rails"))
      await settle()
      expect(search).toHaveBeenCalledWith({ q: "rails", view: "archived" })

      act(() => result.current.setHistory("all"))
      await settle()

      expect(search).toHaveBeenLastCalledWith({ q: "rails" })
    })

    it("reports nothing to widen when the list imposes no read-state window", () => {
      const { result } = renderHook(() => useEntrySearch({ feed_id: 7 }))

      expect(result.current.canWidenHistory).toBe(false)
      expect(result.current.canWidenPlace).toBe(true)
    })
  })

  describe("scope persistence", () => {
    it("survives editing the query", async () => {
      const { result } = renderHook(() => useEntrySearch({ feed_id: 7, unread: true }))

      act(() => result.current.setQuery("rails"))
      await settle()
      act(() => {
        result.current.setPlace("everything")
        result.current.setHistory("all")
      })
      await settle()

      act(() => result.current.setQuery("rails engine"))
      await settle()

      expect(result.current.place).toBe("everything")
      expect(result.current.history).toBe("all")
      expect(search).toHaveBeenLastCalledWith({ q: "rails engine" })
    })

    it("survives the list being re-rendered around it", async () => {
      const { result, rerender } = renderHook(() =>
        useEntrySearch({ feed_id: 7, unread: true })
      )

      act(() => result.current.setQuery("rails"))
      await settle()
      act(() => result.current.setPlace("everything"))
      await settle()

      rerender()

      expect(result.current.place).toBe("everything")
    })

    it("resets to the list's own scope when the box is cleared", async () => {
      const { result } = renderHook(() => useEntrySearch({ feed_id: 7, unread: true }))

      act(() => result.current.setQuery("rails"))
      await settle()
      act(() => {
        result.current.setPlace("everything")
        result.current.setHistory("all")
      })
      await settle()

      act(() => result.current.clear())

      expect(result.current.place).toBe("list")
      expect(result.current.history).toBe("list")

      act(() => result.current.setQuery("rails"))
      await settle()

      expect(search).toHaveBeenLastCalledWith({ q: "rails", feed_id: 7, unread: true })
    })
  })

  describe("matches outside the scope", () => {
    it("counts them when a narrowed search finds nothing", async () => {
      search
        .mockResolvedValueOnce(mockSearchResponse([]))
        .mockResolvedValueOnce(mockSearchResponse([], { pagination: { page: 1, per_page: 1, total: 42, total_pages: 42 } }))
      const { result } = renderHook(() => useEntrySearch({ feed_id: 7 }))

      act(() => result.current.setQuery("rails"))
      await settle()

      expect(search).toHaveBeenCalledTimes(2)
      expect(search).toHaveBeenLastCalledWith({ q: "rails", per_page: 1 })
      expect(result.current.widerMatchCount).toBe(42)
    })

    it("does not ask when the search was not narrowed in the first place", async () => {
      search.mockResolvedValue(mockSearchResponse([]))
      const { result } = renderHook(() => useEntrySearch({}))

      act(() => result.current.setQuery("rails"))
      await settle()

      expect(search).toHaveBeenCalledTimes(1)
      expect(result.current.widerMatchCount).toBeNull()
    })

    it("does not ask when the narrowed search found something", async () => {
      search.mockResolvedValue(mockSearchResponse([mockSearchResult()]))
      const { result } = renderHook(() => useEntrySearch({ feed_id: 7 }))

      act(() => result.current.setQuery("rails"))
      await settle()

      expect(search).toHaveBeenCalledTimes(1)
      expect(result.current.widerMatchCount).toBeNull()
    })

    it("keeps the empty result set when the count request fails", async () => {
      search
        .mockResolvedValueOnce(mockSearchResponse([]))
        .mockRejectedValueOnce(new Error("HTTP 500"))
      const { result } = renderHook(() => useEntrySearch({ feed_id: 7 }))

      act(() => result.current.setQuery("rails"))
      await settle()

      expect(result.current.error).toBeNull()
      expect(result.current.widerMatchCount).toBeNull()
    })

    it("forgets the count once the scope is widened and hits come back", async () => {
      search
        .mockResolvedValueOnce(mockSearchResponse([]))
        .mockResolvedValueOnce(mockSearchResponse([], { pagination: { page: 1, per_page: 1, total: 42, total_pages: 42 } }))
        .mockResolvedValueOnce(mockSearchResponse([mockSearchResult()]))
      const { result } = renderHook(() => useEntrySearch({ feed_id: 7 }))

      act(() => result.current.setQuery("rails"))
      await settle()
      expect(result.current.widerMatchCount).toBe(42)

      act(() => result.current.setPlace("everything"))
      await settle()

      expect(result.current.widerMatchCount).toBeNull()
      expect(result.current.results).toHaveLength(1)
    })
  })

  describe("updating a result in place", () => {
    /** Two unread hits from two different feeds, already on screen. */
    async function searched(list: Parameters<typeof useEntrySearch>[0] = {}) {
      search.mockResolvedValue(
        mockSearchResponse([
          mockSearchResult({ id: 1, entry_id: 100, feed_id: 7, title: "First" }),
          mockSearchResult({ id: 2, entry_id: 200, feed_id: 9, title: "Second" }),
        ])
      )
      const rendered = renderHook(() => useEntrySearch(list))
      act(() => rendered.result.current.setQuery("rails"))
      await settle()
      expect(rendered.result.current.results).toHaveLength(2)
      return rendered
    }

    it("marks the named row read and leaves the others alone", async () => {
      const { result } = await searched()

      act(() => result.current.updateResult(1, { unread: false }))

      expect(result.current.results[0].unread).toBe(false)
      expect(result.current.results[1].unread).toBe(true)
    })

    it("keys off the user_entry id, not the entry id", async () => {
      const { result } = await searched()

      // 100 is row 1's `entry_id`. The entry handlers work in user_entry ids,
      // so a hook that matched on entry_id would mark the wrong row, or none.
      act(() => result.current.updateResult(100, { unread: false }))

      expect(result.current.results.map((r) => r.unread)).toEqual([true, true])
    })

    it("carries a starred change onto the row", async () => {
      const { result } = await searched()

      act(() => result.current.updateResult(2, { starred: true }))

      expect(result.current.results[1].starred).toBe(true)
      expect(result.current.results[0].starred).toBe(false)
    })

    it("leaves the rest of the row intact", async () => {
      const { result } = await searched()

      act(() => result.current.updateResult(1, { unread: false }))

      expect(result.current.results[0]).toMatchObject({
        id: 1,
        entry_id: 100,
        title: "First",
        starred: false,
      })
      expect(result.current.results[0].snippet).not.toBe("")
    })

    it("keeps a row that has stopped matching the scope rather than dropping it", async () => {
      // An unread-only search: marking a hit read makes it fail the filter the
      // scope pill is still claiming. It stays put, the way the entry list
      // keeps read articles until the next load.
      const { result } = await searched({ unread: true })

      act(() => result.current.updateResult(1, { unread: false }))

      expect(result.current.results).toHaveLength(2)
      expect(result.current.results[0].id).toBe(1)
    })

    it("does nothing for an id that is not in the result set", async () => {
      const { result } = await searched()
      const before = result.current.results

      act(() => result.current.updateResult(999, { unread: false }))

      // Same array, not just equal: a new one rerenders every row for nothing.
      expect(result.current.results).toBe(before)
    })

    it("updates every row a bulk matcher accepts", async () => {
      const { result } = await searched()

      act(() => result.current.updateResults(() => true, { unread: false }))

      expect(result.current.results.map((r) => r.unread)).toEqual([false, false])
    })

    it("leaves rows the bulk matcher rejects untouched", async () => {
      // Mark-all-read is scoped to a feed; a search widened past that feed can
      // be showing rows the sweep never reached.
      const { result } = await searched()

      act(() =>
        result.current.updateResults((r) => r.feed_id === 7, { unread: false })
      )

      expect(result.current.results.map((r) => r.unread)).toEqual([false, true])
    })

    it("is overwritten by the server's answer on the next request", async () => {
      const { result } = await searched()
      act(() => result.current.updateResult(1, { unread: false }))
      expect(result.current.results[0].unread).toBe(false)

      search.mockResolvedValue(
        mockSearchResponse([mockSearchResult({ id: 1, entry_id: 100, unread: true })])
      )
      act(() => result.current.setQuery("rails engine"))
      await settle()

      expect(result.current.results[0].unread).toBe(true)
    })
  })

  describe("failure", () => {
    it("surfaces the error and shows no stale results", async () => {
      search.mockResolvedValueOnce(mockSearchResponse([mockSearchResult()]))
      const { result } = renderHook(() => useEntrySearch())

      act(() => result.current.setQuery("rails"))
      await settle()
      expect(result.current.results).toHaveLength(1)

      search.mockRejectedValueOnce(new Error("HTTP 500"))
      act(() => result.current.setQuery("rails again"))
      await settle()

      expect(result.current.error).toBe("HTTP 500")
      expect(result.current.results).toEqual([])
      expect(result.current.isSearching).toBe(false)
    })

    it("clears a previous error once a query succeeds", async () => {
      search.mockRejectedValueOnce(new Error("HTTP 500"))
      const { result } = renderHook(() => useEntrySearch())

      act(() => result.current.setQuery("rails"))
      await settle()
      expect(result.current.error).toBe("HTTP 500")

      search.mockResolvedValueOnce(mockSearchResponse([mockSearchResult()]))
      act(() => result.current.setQuery("rails ok"))
      await settle()

      expect(result.current.error).toBeNull()
      expect(result.current.results).toHaveLength(1)
    })
  })
})
