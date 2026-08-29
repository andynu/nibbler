import { renderHook, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useEmbedPolicy } from "./useEmbedPolicy"

const mockEmbedPolicy = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    entries: {
      embedPolicy: (...args: unknown[]) => mockEmbedPolicy(...args),
    },
  },
}))

describe("useEmbedPolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEmbedPolicy.mockResolvedValue({ status: "embeddable", reason: null })
  })

  it("reports a refusal once the server has read the page's headers", async () => {
    mockEmbedPolicy.mockResolvedValue({
      status: "blocked",
      reason: "x-frame-options: deny",
    })

    const { result } = renderHook(() => useEmbedPolicy({ entryId: 7, enabled: true }))

    await waitFor(() => expect(result.current.blocked).toBe(true))
    expect(result.current.reason).toBe("x-frame-options: deny")
    expect(mockEmbedPolicy).toHaveBeenCalledWith(7)
  })

  it("leaves the frame alone for a page that embeds fine", async () => {
    const { result } = renderHook(() => useEmbedPolicy({ entryId: 7, enabled: true }))

    await waitFor(() => expect(mockEmbedPolicy).toHaveBeenCalled())
    expect(result.current.blocked).toBe(false)
  })

  // The reader's own browser may reach a site the probe could not.
  it("leaves the frame alone when the site could not be asked", async () => {
    mockEmbedPolicy.mockResolvedValue({ status: "unknown", reason: "Connection timed out" })

    const { result } = renderHook(() => useEmbedPolicy({ entryId: 7, enabled: true }))

    await waitFor(() => expect(mockEmbedPolicy).toHaveBeenCalled())
    expect(result.current.blocked).toBe(false)
  })

  it("leaves the frame alone when the request itself fails", async () => {
    mockEmbedPolicy.mockRejectedValue(new Error("HTTP 500"))

    const { result } = renderHook(() => useEmbedPolicy({ entryId: 7, enabled: true }))

    await waitFor(() => expect(mockEmbedPolicy).toHaveBeenCalled())
    expect(result.current.blocked).toBe(false)
  })

  it("asks nothing while the feed's own content is on screen", () => {
    renderHook(() => useEmbedPolicy({ entryId: 7, enabled: false }))

    expect(mockEmbedPolicy).not.toHaveBeenCalled()
  })

  it("asks nothing when no entry is selected", () => {
    renderHook(() => useEmbedPolicy({ entryId: null, enabled: true }))

    expect(mockEmbedPolicy).not.toHaveBeenCalled()
  })

  it("re-asks for each entry the reader moves to", async () => {
    const { result, rerender } = renderHook(
      ({ entryId }) => useEmbedPolicy({ entryId, enabled: true }),
      { initialProps: { entryId: 7 } }
    )

    await waitFor(() => expect(mockEmbedPolicy).toHaveBeenCalledWith(7))

    mockEmbedPolicy.mockResolvedValue({ status: "blocked", reason: "x-frame-options: deny" })
    rerender({ entryId: 8 })

    await waitFor(() => expect(result.current.blocked).toBe(true))
    expect(mockEmbedPolicy).toHaveBeenCalledWith(8)
  })

  // j/k through a list faster than the probes come back, and a stale answer
  // would put the fallback in front of an article that never refused anything.
  it("ignores an answer that arrives after the reader has moved on", async () => {
    let resolveFirst: (value: unknown) => void = () => {}
    mockEmbedPolicy.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve
      })
    )

    const { result, rerender } = renderHook(
      ({ entryId }) => useEmbedPolicy({ entryId, enabled: true }),
      { initialProps: { entryId: 7 } }
    )

    rerender({ entryId: 8 })
    resolveFirst({ status: "blocked", reason: "x-frame-options: deny" })

    await waitFor(() => expect(mockEmbedPolicy).toHaveBeenCalledWith(8))
    expect(result.current.blocked).toBe(false)
  })

  it("clears a refusal when the reader switches back to the feed's content", async () => {
    mockEmbedPolicy.mockResolvedValue({ status: "blocked", reason: "x-frame-options: deny" })

    const { result, rerender } = renderHook(
      ({ enabled }) => useEmbedPolicy({ entryId: 7, enabled }),
      { initialProps: { enabled: true } }
    )

    await waitFor(() => expect(result.current.blocked).toBe(true))

    rerender({ enabled: false })

    expect(result.current.blocked).toBe(false)
  })
})
