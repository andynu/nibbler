import { renderHook, act, waitFor } from "@testing-library/react"
import { describe, it, expect, beforeEach, vi } from "vitest"
import type { BaseMixin, ChannelNameWithParams } from "@rails/actioncable"
import type { EntrySummary } from "@/lib/api"

const { getConsumer, create, unsubscribe } = vi.hoisted(() => {
  const unsubscribe = vi.fn()
  const create = vi.fn(
    (_channel: string | ChannelNameWithParams, _mixin: BaseMixin) => ({ unsubscribe })
  )
  const consumer = { subscriptions: { create } }
  const getConsumer = vi.fn(() => consumer)
  return { getConsumer, create, unsubscribe }
})

vi.mock("@/lib/cable", () => ({ getConsumer, resetConsumer: vi.fn() }))

const mockSummarize = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    entries: {
      summarize: (...args: unknown[]) => mockSummarize(...args),
    },
  },
}))

import { useEntrySummary } from "./useEntrySummary"

const PARAGRAPH = "Three brokerages will pay ninety million dollars to settle claims."

function summary(overrides: Partial<EntrySummary> = {}): EntrySummary {
  return {
    summary: PARAGRAPH,
    model: "gemma4:e4b",
    generated_at: "2026-08-30T12:00:00Z",
    stale: false,
    ...overrides,
  }
}

function mixin(): BaseMixin {
  return create.mock.calls[0][1]
}

function render(props: { id: number | null; entryId: number | null; initialSummary?: EntrySummary | null }) {
  return renderHook((current: typeof props) => useEntrySummary(current), { initialProps: props })
}

describe("useEntrySummary", () => {
  beforeEach(() => {
    create.mockClear()
    unsubscribe.mockClear()
    mockSummarize.mockReset()
    mockSummarize.mockResolvedValue({ status: "queued" })
  })

  // The channel is keyed on the shared entry, not the per-reader user_entry,
  // because a summary generated for one reader is the summary every other
  // reader of that article would have got.
  it("subscribes to the shared entry's channel", () => {
    render({ id: 5, entryId: 42 })

    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0]).toEqual({ channel: "EntrySummaryChannel", entry_id: 42 })
  })

  it("opens no socket before there is an article", () => {
    render({ id: null, entryId: null })

    expect(create).not.toHaveBeenCalled()
  })

  it("unsubscribes on unmount", () => {
    const { unmount } = render({ id: 5, entryId: 42 })

    unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it("resubscribes when the reader moves to another article", () => {
    const { rerender } = render({ id: 5, entryId: 42 })

    rerender({ id: 6, entryId: 43 })

    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[1][0]).toEqual({ channel: "EntrySummaryChannel", entry_id: 43 })
  })

  // --- what the reader sees -------------------------------------------------

  it("starts idle for an article with no summary", () => {
    const { result } = render({ id: 5, entryId: 42 })

    expect(result.current.state).toBe("idle")
    expect(result.current.summary).toBeNull()
  })

  // A summary that came down with the article is shown without asking for it,
  // and without a request or any model time.
  it("shows a summary that arrived with the article", () => {
    const { result } = render({ id: 5, entryId: 42, initialSummary: summary() })

    expect(result.current.state).toBe("ready")
    expect(result.current.summary?.summary).toBe(PARAGRAPH)
    expect(mockSummarize).not.toHaveBeenCalled()
  })

  it("picks up a summary that arrives after the entry id does", () => {
    const { result, rerender } = render({ id: 5, entryId: 42 })

    rerender({ id: 5, entryId: 42, initialSummary: summary() })

    expect(result.current.state).toBe("ready")
  })

  it("forgets the previous article's summary when the reader moves on", () => {
    const { result, rerender } = render({ id: 5, entryId: 42, initialSummary: summary() })

    rerender({ id: 6, entryId: 43 })

    expect(result.current.state).toBe("idle")
    expect(result.current.summary).toBeNull()
  })

  it("shows each state the job broadcasts", async () => {
    const { result } = render({ id: 5, entryId: 42 })

    act(() => mixin().received?.({ entry_id: 42, state: "running" }))
    expect(result.current.state).toBe("running")

    act(() => mixin().received?.({ entry_id: 42, state: "ready", summary: summary() }))
    expect(result.current.state).toBe("ready")
    expect(result.current.summary?.summary).toBe(PARAGRAPH)
  })

  it("carries the reason a generation stopped", () => {
    const { result } = render({ id: 5, entryId: 42 })

    act(() =>
      mixin().received?.({
        entry_id: 42,
        state: "unavailable",
        message: "The summarizer is not responding right now.",
      })
    )

    expect(result.current.state).toBe("unavailable")
    expect(result.current.message).toBe("The summarizer is not responding right now.")
  })

  it("carries the article's length when it is too short to summarize", () => {
    const { result } = render({ id: 5, entryId: 42 })

    act(() =>
      mixin().received?.({ entry_id: 42, state: "too_short", message: "too short", content_length: 340 })
    )

    expect(result.current.state).toBe("too_short")
    expect(result.current.contentLength).toBe(340)
  })

  // --- asking for one -------------------------------------------------------

  it("asks by user_entry id, which is what the entries API takes", async () => {
    const { result } = render({ id: 5, entryId: 42 })

    await act(async () => { await result.current.request() })

    expect(mockSummarize).toHaveBeenCalledWith(5)
    expect(result.current.state).toBe("queued")
  })

  // The server suppresses the duplicate too, but a second press should not even
  // reach it: two clicks in one tick both read the same state.
  it("ignores a second press while one is in flight", async () => {
    const { result } = render({ id: 5, entryId: 42 })

    await act(async () => {
      await Promise.all([result.current.request(), result.current.request()])
    })

    expect(mockSummarize).toHaveBeenCalledTimes(1)
  })

  it("shows a cached summary the server answered with", async () => {
    mockSummarize.mockResolvedValue({ status: "ready", summary: summary() })
    const { result } = render({ id: 5, entryId: 42 })

    await act(async () => { await result.current.request() })

    expect(result.current.state).toBe("ready")
    expect(result.current.summary?.summary).toBe(PARAGRAPH)
  })

  it("reports a request that never reached the server", async () => {
    mockSummarize.mockRejectedValue(new Error("Network error"))
    const { result } = render({ id: 5, entryId: 42 })

    await act(async () => { await result.current.request() })

    await waitFor(() => expect(result.current.state).toBe("failed"))
    expect(result.current.message).toBe("Network error")
  })

  // The POST's reply and the broadcasts describe the same run over two
  // transports. The worker can start before Puma has finished writing the
  // response, so a late "queued" must not undo a "running" already on screen.
  it("does not let a late reply walk the progress backwards", async () => {
    let resolveRequest: (value: unknown) => void = () => {}
    mockSummarize.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve }))
    const { result } = render({ id: 5, entryId: 42 })

    let pending: Promise<void>
    act(() => { pending = result.current.request() })
    act(() => mixin().received?.({ entry_id: 42, state: "running" }))
    expect(result.current.state).toBe("running")

    await act(async () => {
      resolveRequest({ status: "queued" })
      await pending
    })

    expect(result.current.state).toBe("running")
  })

  // A summary of slightly older text beats a blank space while its replacement
  // is being written.
  it("keeps the stale paragraph on screen while regenerating it", async () => {
    const { result } = render({ id: 5, entryId: 42, initialSummary: summary({ stale: true }) })

    await act(async () => { await result.current.request() })

    expect(result.current.state).toBe("queued")
    expect(result.current.summary?.summary).toBe(PARAGRAPH)
  })

  it("does nothing without an article to ask about", async () => {
    const { result } = render({ id: null, entryId: null })

    await act(async () => { await result.current.request() })

    expect(mockSummarize).not.toHaveBeenCalled()
  })

  // Action Cable does not retry a rejected subscription, so this is how a
  // caller tells "the server refused this entry" from "the socket is down".
  it("reports a refused subscription", () => {
    const { result } = render({ id: 5, entryId: 42 })

    act(() => mixin().rejected?.())

    expect(result.current.connection).toBe("rejected")
  })
})
