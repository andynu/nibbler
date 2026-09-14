import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import type { BaseMixin, ChannelNameWithParams } from "@rails/actioncable"

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

import { useCountersNudge, COUNTERS_NUDGE_COALESCE_MS } from "./useCountersNudge"

function mixin(): BaseMixin {
  return create.mock.calls[0][1]
}

function nudge() {
  act(() => mixin().received?.({ stale: true }))
}

function elapse(ms: number) {
  act(() => void vi.advanceTimersByTime(ms))
}

describe("useCountersNudge", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    create.mockClear()
    unsubscribe.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("subscribes to the counters channel", () => {
    renderHook(() => useCountersNudge(vi.fn()))

    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0]).toBe("CountersChannel")
  })

  it("refetches once the coalesce window after a nudge has passed", () => {
    const refresh = vi.fn()
    renderHook(() => useCountersNudge(refresh))

    nudge()
    elapse(COUNTERS_NUDGE_COALESCE_MS - 1)
    expect(refresh).not.toHaveBeenCalled()

    elapse(1)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  // One job per due feed broadcasts, so a single refresh cycle can nudge the
  // same reader several times in a few seconds.
  it("collapses a burst of nudges into one refetch", () => {
    const refresh = vi.fn()
    renderHook(() => useCountersNudge(refresh))

    nudge()
    elapse(500)
    nudge()
    elapse(500)
    nudge()
    elapse(COUNTERS_NUDGE_COALESCE_MS)

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("refetches again for a nudge that arrives after the last one was served", () => {
    const refresh = vi.fn()
    renderHook(() => useCountersNudge(refresh))

    nudge()
    elapse(COUNTERS_NUDGE_COALESCE_MS)
    nudge()
    elapse(COUNTERS_NUDGE_COALESCE_MS)

    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it("does not refetch on the first connect", () => {
    const refresh = vi.fn()
    renderHook(() => useCountersNudge(refresh))

    act(() => mixin().connected?.({ reconnected: false }))
    elapse(COUNTERS_NUDGE_COALESCE_MS * 2)

    expect(refresh).not.toHaveBeenCalled()
  })

  // Action Cable does not replay broadcasts sent while the socket was down.
  it("refetches after a reconnect", () => {
    const refresh = vi.fn()
    renderHook(() => useCountersNudge(refresh))

    act(() => mixin().connected?.({ reconnected: false }))
    act(() => mixin().disconnected?.({ willAttemptReconnect: true }))
    act(() => mixin().connected?.({ reconnected: true }))
    elapse(COUNTERS_NUDGE_COALESCE_MS)

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("holds a nudge while disabled and replays it once when re-enabled", () => {
    const refresh = vi.fn()
    const { rerender } = renderHook(
      ({ enabled }) => useCountersNudge(refresh, { enabled }),
      { initialProps: { enabled: false } }
    )

    nudge()
    elapse(COUNTERS_NUDGE_COALESCE_MS)
    expect(refresh).not.toHaveBeenCalled()

    rerender({ enabled: true })
    expect(refresh).toHaveBeenCalledTimes(1)

    elapse(COUNTERS_NUDGE_COALESCE_MS * 2)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("does not refetch on re-enable when no nudge was missed", () => {
    const refresh = vi.fn()
    const { rerender } = renderHook(
      ({ enabled }) => useCountersNudge(refresh, { enabled }),
      { initialProps: { enabled: false } }
    )

    rerender({ enabled: true })
    elapse(COUNTERS_NUDGE_COALESCE_MS * 2)

    expect(refresh).not.toHaveBeenCalled()
  })

  it("keeps one subscription while enabled toggles", () => {
    const { rerender } = renderHook(
      ({ enabled }) => useCountersNudge(vi.fn(), { enabled }),
      { initialProps: { enabled: true } }
    )

    rerender({ enabled: false })
    rerender({ enabled: true })

    expect(create).toHaveBeenCalledTimes(1)
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it("calls the refresh passed on the latest render", () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ refresh }) => useCountersNudge(refresh), {
      initialProps: { refresh: first },
    })

    rerender({ refresh: second })
    nudge()
    elapse(COUNTERS_NUDGE_COALESCE_MS)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it("unsubscribes on unmount and drops a refetch still waiting", () => {
    const refresh = vi.fn()
    const { unmount } = renderHook(() => useCountersNudge(refresh))

    nudge()
    unmount()
    elapse(COUNTERS_NUDGE_COALESCE_MS)

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
  })
})
