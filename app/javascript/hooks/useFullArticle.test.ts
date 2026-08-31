import { renderHook, act, waitFor } from "@testing-library/react"
import { describe, it, expect, beforeEach, vi } from "vitest"
import type { FullArticle } from "@/lib/api"

const mockFullText = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    entries: {
      fullText: (...args: unknown[]) => mockFullText(...args),
    },
  },
}))

import { useFullArticle } from "./useFullArticle"

const ARTICLE = "<p>The council voted 5-2 to reject the rezoning.</p>"

function ready(overrides: Partial<Extract<FullArticle, { status: "ready" }>> = {}): FullArticle {
  return {
    status: "ready",
    content: ARTICLE,
    char_count: 46,
    fetched_at: "2026-08-31T12:00:00Z",
    ...overrides,
  }
}

function unavailable(message = "The full article could not be retrieved."): FullArticle {
  return { status: "unavailable", message, fetched_at: "2026-08-31T12:00:00Z" }
}

function render(props: { id: number | null; initial?: FullArticle | null }) {
  return renderHook((current: typeof props) => useFullArticle(current), { initialProps: props })
}

describe("useFullArticle", () => {
  beforeEach(() => {
    mockFullText.mockReset()
    mockFullText.mockResolvedValue({ full_text: ready() })
  })

  it("starts idle when the article carries no fetch", () => {
    const { result } = render({ id: 7 })

    expect(result.current.state).toBe("idle")
    expect(result.current.content).toBeNull()
  })

  // A fetch that already happened comes down with the article, so re-opening it
  // costs no request.
  it("shows an article that came down with the entry without asking again", () => {
    const { result } = render({ id: 7, initial: ready() })

    expect(result.current.state).toBe("ready")
    expect(result.current.content).toBe(ARTICLE)
    expect(mockFullText).not.toHaveBeenCalled()
  })

  // Being told beats pressing a button and waiting for a request the server has
  // already decided not to make.
  it("shows a stored failure without asking again", () => {
    const { result } = render({ id: 7, initial: unavailable() })

    expect(result.current.state).toBe("unavailable")
    expect(result.current.message).toBe("The full article could not be retrieved.")
    expect(mockFullText).not.toHaveBeenCalled()
  })

  it("fetches on request and shows the article", async () => {
    const { result } = render({ id: 7 })

    await act(async () => {
      await result.current.request()
    })

    expect(mockFullText).toHaveBeenCalledWith(7)
    await waitFor(() => expect(result.current.state).toBe("ready"))
    expect(result.current.content).toBe(ARTICLE)
  })

  it("reports the server's one message when the publisher cannot be read", async () => {
    mockFullText.mockResolvedValue({ full_text: unavailable("The full article could not be retrieved.") })
    const { result } = render({ id: 7 })

    await act(async () => {
      await result.current.request()
    })

    expect(result.current.state).toBe("unavailable")
    expect(result.current.message).toBe("The full article could not be retrieved.")
    expect(result.current.content).toBeNull()
  })

  // The reader's situation is the same whether the publisher refused or the
  // request never arrived, so they are told the same thing.
  it("reports the same message when the request itself fails", async () => {
    mockFullText.mockRejectedValue(new Error("HTTP 500"))
    const { result } = render({ id: 7 })

    await act(async () => {
      await result.current.request()
    })

    expect(result.current.state).toBe("unavailable")
    expect(result.current.message).toBe("The full article could not be retrieved.")
  })

  it("does not send a second request while one is in flight", async () => {
    let resolve: (value: unknown) => void = () => {}
    mockFullText.mockImplementation(() => new Promise((r) => { resolve = r }))
    const { result } = render({ id: 7 })

    await act(async () => {
      void result.current.request()
      void result.current.request()
    })

    expect(mockFullText).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolve({ full_text: ready() })
    })
  })

  it("does nothing without an entry", async () => {
    const { result } = render({ id: null })

    await act(async () => {
      await result.current.request()
    })

    expect(mockFullText).not.toHaveBeenCalled()
    expect(result.current.state).toBe("idle")
  })

  it("resets when a different article is opened", async () => {
    const { result, rerender } = render({ id: 7, initial: ready() })
    expect(result.current.state).toBe("ready")

    rerender({ id: 8, initial: null })

    await waitFor(() => expect(result.current.state).toBe("idle"))
    expect(result.current.content).toBeNull()
  })

  // The list row opens first and the full article payload arrives with the
  // second request, so the hook has to pick it up after mounting without one.
  it("picks up an article that arrives after the entry id", async () => {
    const { result, rerender } = render({ id: 7, initial: null })
    expect(result.current.state).toBe("idle")

    rerender({ id: 7, initial: ready() })

    await waitFor(() => expect(result.current.state).toBe("ready"))
  })
})
