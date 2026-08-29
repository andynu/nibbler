import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { useBackgroundRefresh, BACKGROUND_REFRESH_INTERVAL_MS } from "./useBackgroundRefresh"

/**
 * Drive the tab between visible and hidden the way a browser does: flip
 * `document.hidden`, then fire the event listeners hang off.
 */
function setTabHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, value: hidden })
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: hidden ? "hidden" : "visible",
  })
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"))
  })
}

describe("useBackgroundRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setTabHidden(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("does not refresh on mount", () => {
    const refresh = vi.fn()

    renderHook(() => useBackgroundRefresh(refresh, { intervalMs: 1000 }))

    expect(refresh).not.toHaveBeenCalled()
  })

  it("refreshes once per interval while the tab is visible", () => {
    const refresh = vi.fn()
    renderHook(() => useBackgroundRefresh(refresh, { intervalMs: 1000 }))

    act(() => void vi.advanceTimersByTime(3000))

    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it("does not refresh while the tab is hidden", () => {
    const refresh = vi.fn()
    renderHook(() => useBackgroundRefresh(refresh, { intervalMs: 1000 }))

    setTabHidden(true)
    act(() => void vi.advanceTimersByTime(10_000))

    expect(refresh).not.toHaveBeenCalled()
  })

  it("does not start a timer when mounted on a hidden tab", () => {
    setTabHidden(true)
    const refresh = vi.fn()

    renderHook(() => useBackgroundRefresh(refresh, { intervalMs: 1000 }))
    act(() => void vi.advanceTimersByTime(10_000))

    expect(refresh).not.toHaveBeenCalled()
  })

  it("refreshes immediately when the tab becomes visible again", () => {
    const refresh = vi.fn()
    renderHook(() => useBackgroundRefresh(refresh, { intervalMs: 1000 }))

    setTabHidden(true)
    act(() => void vi.advanceTimersByTime(10_000))
    setTabHidden(false)

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("re-bases the interval on the visibility refresh instead of firing twice", () => {
    const refresh = vi.fn()
    renderHook(() => useBackgroundRefresh(refresh, { intervalMs: 1000 }))

    // Hide 900ms into the first interval, come back immediately.
    act(() => void vi.advanceTimersByTime(900))
    setTabHidden(true)
    setTabHidden(false)
    expect(refresh).toHaveBeenCalledTimes(1)

    // The leftover 100ms of the pre-hide interval must not fire a second call.
    act(() => void vi.advanceTimersByTime(100))
    expect(refresh).toHaveBeenCalledTimes(1)

    act(() => void vi.advanceTimersByTime(900))
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it("resumes polling after the tab comes back", () => {
    const refresh = vi.fn()
    renderHook(() => useBackgroundRefresh(refresh, { intervalMs: 1000 }))

    setTabHidden(true)
    setTabHidden(false)
    act(() => void vi.advanceTimersByTime(2000))

    // One for the visibility refresh, two for the ticks since.
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it("calls the latest callback, not the one passed on mount", () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ refresh }: { refresh: () => void }) => useBackgroundRefresh(refresh, { intervalMs: 1000 }),
      { initialProps: { refresh: first } }
    )

    rerender({ refresh: second })
    act(() => void vi.advanceTimersByTime(1000))

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it("does not restart the timer when the callback identity changes", () => {
    const { rerender } = renderHook(
      ({ refresh }: { refresh: () => void }) => useBackgroundRefresh(refresh, { intervalMs: 1000 }),
      { initialProps: { refresh: vi.fn() } }
    )

    const latest = vi.fn()
    // A fresh closure every 400ms, the way an inline arrow in a re-rendering
    // component arrives. The tick must still land on schedule.
    act(() => void vi.advanceTimersByTime(400))
    rerender({ refresh: vi.fn() })
    act(() => void vi.advanceTimersByTime(400))
    rerender({ refresh: latest })
    act(() => void vi.advanceTimersByTime(200))

    expect(latest).toHaveBeenCalledTimes(1)
  })

  it("polls nothing while disabled", () => {
    const refresh = vi.fn()
    renderHook(() => useBackgroundRefresh(refresh, { intervalMs: 1000, enabled: false }))

    act(() => void vi.advanceTimersByTime(5000))
    setTabHidden(true)
    setTabHidden(false)

    expect(refresh).not.toHaveBeenCalled()
  })

  it("starts polling when it is re-enabled", () => {
    const refresh = vi.fn()
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useBackgroundRefresh(refresh, { intervalMs: 1000, enabled }),
      { initialProps: { enabled: false } }
    )

    rerender({ enabled: true })
    act(() => void vi.advanceTimersByTime(1000))

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("stops polling on unmount", () => {
    const refresh = vi.fn()
    const { unmount } = renderHook(() => useBackgroundRefresh(refresh, { intervalMs: 1000 }))

    unmount()
    act(() => void vi.advanceTimersByTime(5000))
    setTabHidden(true)
    setTabHidden(false)

    expect(refresh).not.toHaveBeenCalled()
  })

  it("labels a scheduled tick as an interval refresh", () => {
    const refresh = vi.fn()
    renderHook(() => useBackgroundRefresh(refresh, { intervalMs: 1000 }))

    act(() => void vi.advanceTimersByTime(1000))

    expect(refresh).toHaveBeenCalledWith("interval")
  })

  it("labels the refresh a returning tab triggers as a visibility refresh", () => {
    const refresh = vi.fn()
    renderHook(() => useBackgroundRefresh(refresh, { intervalMs: 1000 }))

    setTabHidden(true)
    setTabHidden(false)
    expect(refresh).toHaveBeenCalledWith("visible")

    // The ticks that follow are ordinary ones again.
    act(() => void vi.advanceTimersByTime(1000))
    expect(refresh).toHaveBeenLastCalledWith("interval")
  })

  it("defaults to a one minute interval", () => {
    const refresh = vi.fn()
    renderHook(() => useBackgroundRefresh(refresh))

    act(() => void vi.advanceTimersByTime(BACKGROUND_REFRESH_INTERVAL_MS - 1))
    expect(refresh).not.toHaveBeenCalled()

    act(() => void vi.advanceTimersByTime(1))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
