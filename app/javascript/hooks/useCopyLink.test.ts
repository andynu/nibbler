import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { useCopyLink, COPY_LINK_FEEDBACK_MS } from "./useCopyLink"

const LINK = "https://example.com/article"

/** Replace the clipboard happy-dom does not implement. */
function stubClipboard(writeText: unknown) {
  Object.defineProperty(navigator, "clipboard", {
    value: writeText === undefined ? undefined : { writeText },
    configurable: true,
  })
}

describe("useCopyLink", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    stubClipboard(undefined)
  })

  it("starts idle", () => {
    const { result } = renderHook(() => useCopyLink())

    expect(result.current.status).toBe("idle")
  })

  it("writes the link and reports success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)

    const { result } = renderHook(() => useCopyLink())
    await act(async () => {
      await result.current.copy(LINK)
    })

    expect(writeText).toHaveBeenCalledWith(LINK)
    expect(result.current.status).toBe("copied")
  })

  it("clears the confirmation once the feedback window passes", async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined))

    const { result } = renderHook(() => useCopyLink())
    await act(async () => {
      await result.current.copy(LINK)
    })
    expect(result.current.status).toBe("copied")

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COPY_LINK_FEEDBACK_MS)
    })

    expect(result.current.status).toBe("idle")
  })

  it("restarts the window when a second copy lands inside it", async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined))

    const { result } = renderHook(() => useCopyLink())
    await act(async () => {
      await result.current.copy(LINK)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COPY_LINK_FEEDBACK_MS - 100)
    })
    await act(async () => {
      await result.current.copy(LINK)
    })

    // The first copy's timer would have fired by now if it were still running.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(result.current.status).toBe("copied")

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COPY_LINK_FEEDBACK_MS)
    })
    expect(result.current.status).toBe("idle")
  })

  // The rejection the browser hands back when the document is not focused or
  // the permission is refused. Swallowing it is what makes a failed copy
  // indistinguishable from a successful one.
  it("reports a rejected write rather than letting it go unhandled", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("Document is not focused")))

    const { result } = renderHook(() => useCopyLink())
    await act(async () => {
      await result.current.copy(LINK)
    })

    expect(result.current.status).toBe("error")
  })

  // navigator.clipboard is undefined outside a secure context: plain http on
  // anything but localhost. Reaching for writeText there is a TypeError, not a
  // rejection, so it needs its own guard.
  it("reports an absent clipboard API instead of throwing", async () => {
    stubClipboard(undefined)

    const { result } = renderHook(() => useCopyLink())
    await act(async () => {
      await result.current.copy(LINK)
    })

    expect(result.current.status).toBe("error")
  })

  it("reports an entry with no link as a failure rather than silence", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)

    const { result } = renderHook(() => useCopyLink())
    await act(async () => {
      await result.current.copy("")
    })

    expect(writeText).not.toHaveBeenCalled()
    expect(result.current.status).toBe("error")
  })

  it("keeps a stable copy function across renders", () => {
    const { result, rerender } = renderHook(() => useCopyLink())
    const first = result.current.copy

    rerender()

    expect(result.current.copy).toBe(first)
  })

  it("drops its pending timer on unmount", async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined))

    const { result, unmount } = renderHook(() => useCopyLink())
    await act(async () => {
      await result.current.copy(LINK)
    })
    unmount()

    // A timer that outlived the hook would setState on an unmounted component;
    // React logs nothing for that any more, so the pending count is the signal.
    expect(vi.getTimerCount()).toBe(0)
  })
})
