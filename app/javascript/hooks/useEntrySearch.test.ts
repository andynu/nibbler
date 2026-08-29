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
    search.mockResolvedValue(mockSearchResponse([]))
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

  describe("scope", () => {
    it("sends the feed and category the list is currently showing", async () => {
      const { result } = renderHook(() =>
        useEntrySearch({ feedId: 7, categoryId: 3 })
      )

      act(() => result.current.setQuery("rails"))
      await settle()

      expect(search).toHaveBeenCalledWith({ q: "rails", feed_id: 7, category_id: 3 })
    })

    it("omits scope the list does not have", async () => {
      const { result } = renderHook(() =>
        useEntrySearch({ feedId: null, categoryId: null })
      )

      act(() => result.current.setQuery("rails"))
      await settle()

      expect(search).toHaveBeenCalledWith({
        q: "rails",
        feed_id: undefined,
        category_id: undefined,
      })
    })

    it("re-runs the query when the scope changes", async () => {
      const { result, rerender } = renderHook(
        ({ feedId }: { feedId: number }) => useEntrySearch({ feedId }),
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
