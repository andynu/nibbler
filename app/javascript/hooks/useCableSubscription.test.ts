import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, beforeEach, vi } from "vitest"
import type { BaseMixin, ChannelNameWithParams } from "@rails/actioncable"

const { getConsumer, create, unsubscribe } = vi.hoisted(() => {
  const unsubscribe = vi.fn()
  const create = vi.fn(
    (_channel: string | ChannelNameWithParams, _mixin: BaseMixin) => ({ unsubscribe })
  )
  // One stable object, as @/lib/cable's real accessor returns.
  const consumer = { subscriptions: { create } }
  const getConsumer = vi.fn(() => consumer)
  return { getConsumer, create, unsubscribe }
})

vi.mock("@/lib/cable", () => ({ getConsumer, resetConsumer: vi.fn() }))

import { useCableSubscription } from "./useCableSubscription"

/** The mixin Action Cable would hold, from the nth subscribe of this test. */
function mixin(index = 0): BaseMixin {
  return create.mock.calls[index][1]
}

describe("useCableSubscription", () => {
  beforeEach(() => {
    create.mockClear()
    unsubscribe.mockClear()
    getConsumer.mockClear()
  })

  it("subscribes to the named channel on mount", () => {
    renderHook(() => useCableSubscription("HeartbeatChannel"))

    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0]).toBe("HeartbeatChannel")
  })

  it("passes channel params through", () => {
    renderHook(() => useCableSubscription({ channel: "FeedChannel", feed_id: 7 }))

    expect(create.mock.calls[0][0]).toEqual({ channel: "FeedChannel", feed_id: 7 })
  })

  // The call site gates on auth state, which is not known on the first render.
  it("does not subscribe for a null channel", () => {
    const { result } = renderHook(() => useCableSubscription(null))

    expect(create).not.toHaveBeenCalled()
    expect(result.current).toBe("idle")
  })

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useCableSubscription("HeartbeatChannel"))

    unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it("subscribes once across re-renders that pass new handler closures", () => {
    const { rerender } = renderHook(() =>
      useCableSubscription("HeartbeatChannel", { received: () => {} })
    )

    rerender()
    rerender()

    expect(create).toHaveBeenCalledTimes(1)
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  // An inline object literal is a new reference every render; comparing by
  // value is what keeps that from churning a subscription per render.
  it("subscribes once when an inline channel object keeps the same values", () => {
    const { rerender } = renderHook(
      ({ id }) => useCableSubscription({ channel: "FeedChannel", feed_id: id }),
      { initialProps: { id: 7 } }
    )

    rerender({ id: 7 })

    expect(create).toHaveBeenCalledTimes(1)
  })

  it("resubscribes when the channel params change", () => {
    const { rerender } = renderHook(
      ({ id }) => useCableSubscription({ channel: "FeedChannel", feed_id: id }),
      { initialProps: { id: 7 } }
    )

    rerender({ id: 8 })

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[1][0]).toEqual({ channel: "FeedChannel", feed_id: 8 })
  })

  it("unsubscribes when the channel becomes null", () => {
    const { rerender, result } = renderHook(
      ({ channel }: { channel: string | null }) => useCableSubscription(channel),
      { initialProps: { channel: "HeartbeatChannel" as string | null } }
    )

    rerender({ channel: null })

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(result.current).toBe("idle")
  })

  it("reports the subscription state as the server answers", () => {
    const { result } = renderHook(() => useCableSubscription("HeartbeatChannel"))
    expect(result.current).toBe("idle")

    act(() => mixin().connected?.({ reconnected: false }))
    expect(result.current).toBe("connected")

    act(() => mixin().disconnected?.({ willAttemptReconnect: true }))
    expect(result.current).toBe("disconnected")
  })

  // Action Cable does not retry a rejected subscription, so "rejected" has to
  // be distinguishable from a disconnect that will heal itself.
  it("reports a rejection distinctly from a disconnect", () => {
    const { result } = renderHook(() => useCableSubscription("HeartbeatChannel"))

    act(() => mixin().rejected?.())

    expect(result.current).toBe("rejected")
  })

  it("forwards messages to the handler", () => {
    const received = vi.fn()
    renderHook(() => useCableSubscription<{ at: string }>("HeartbeatChannel", { received }))

    act(() => mixin().received?.({ at: "2026-08-30T00:00:00Z" }))

    expect(received).toHaveBeenCalledWith({ at: "2026-08-30T00:00:00Z" })
  })

  // The handlers live in a ref precisely so a re-render can replace them
  // without touching the wire. If the mixin closed over the first render's
  // callback instead, this would call the stale one.
  it("forwards messages to the handler from the latest render", () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ received }) => useCableSubscription<{ at: string }>("HeartbeatChannel", { received }),
      { initialProps: { received: first } }
    )

    rerender({ received: second })
    act(() => mixin().received?.({ at: "2026-08-30T00:00:00Z" }))

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it("calls the lifecycle handlers alongside tracking state", () => {
    const connected = vi.fn()
    const disconnected = vi.fn()
    const rejected = vi.fn()
    renderHook(() =>
      useCableSubscription("HeartbeatChannel", { connected, disconnected, rejected })
    )

    act(() => mixin().connected?.({ reconnected: false }))
    act(() => mixin().disconnected?.({ willAttemptReconnect: false }))
    act(() => mixin().rejected?.())

    expect(connected).toHaveBeenCalledTimes(1)
    expect(disconnected).toHaveBeenCalledTimes(1)
    expect(rejected).toHaveBeenCalledTimes(1)
  })

  it("subscribes through the shared consumer rather than building its own", () => {
    renderHook(() => useCableSubscription("HeartbeatChannel"))
    renderHook(() => useCableSubscription("OtherChannel"))

    expect(getConsumer).toHaveBeenCalledTimes(2)
    expect(new Set(getConsumer.mock.results.map((r) => r.value)).size).toBe(1)
  })
})
