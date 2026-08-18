import { renderHook } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useContentPaging, ContentPagingOptions } from "./useContentPaging"

interface FakeViewport {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
  scrollTo: ReturnType<typeof vi.fn>
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
  /** Move the viewport the way a wheel or a landing animation would, events and all. */
  moveTo: (top: number) => void
}

// The article viewport is a plain object because happy-dom has no layout:
// clientHeight/scrollHeight are always 0 and scrollTo() does not move anything.
function makeViewport(overrides: Partial<FakeViewport> = {}): FakeViewport {
  const listeners = new Set<() => void>()

  const viewport: FakeViewport = {
    scrollTop: 0,
    clientHeight: 1000,
    scrollHeight: 5000,
    scrollTo: vi.fn(),
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    moveTo: (top) => {
      viewport.scrollTop = top
      listeners.forEach((listener) => listener())
    },
    ...overrides,
  }

  return viewport
}

function setup(
  viewport: FakeViewport | null,
  options: Partial<ContentPagingOptions> = {}
) {
  const onPastEnd = vi.fn()
  const onPastStart = vi.fn()
  const scrollRef = { current: viewport as unknown as HTMLElement | null }

  const view = renderHook(
    (props: { measurable?: boolean; resetKey?: unknown }) =>
      useContentPaging({
        scrollRef,
        onPastEnd,
        onPastStart,
        ...options,
        ...props,
      }),
    { initialProps: { measurable: options.measurable, resetKey: options.resetKey } }
  )

  return { ...view, onPastEnd, onPastStart, scrollRef }
}

// The hook asks for a scroll but nothing moves until we say so, the way a real
// smooth scroll takes time to land.
function landScroll(viewport: FakeViewport) {
  const calls = viewport.scrollTo.mock.calls
  const lastCall = calls[calls.length - 1]
  if (lastCall) viewport.moveTo(lastCall[0].top)
}

describe("useContentPaging", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("pageDownOrNext", () => {
    it("pages down within a long article without navigating", () => {
      const viewport = makeViewport()
      const { result, onPastEnd } = setup(viewport)

      result.current.pageDownOrNext()

      expect(viewport.scrollTo).toHaveBeenCalledWith({
        top: 900,
        behavior: "smooth",
      })
      expect(onPastEnd).not.toHaveBeenCalled()
    })

    it("overlaps pages so context carries over", () => {
      const viewport = makeViewport({ clientHeight: 800, scrollHeight: 5000 })
      const { result } = setup(viewport)

      result.current.pageDownOrNext()

      // 0.9 * clientHeight, leaving 80px of the previous page visible
      expect(viewport.scrollTo).toHaveBeenCalledWith({
        top: 720,
        behavior: "smooth",
      })
    })

    it("stops at the bottom rather than overshooting", () => {
      const viewport = makeViewport({ scrollTop: 3500 })
      const { result, onPastEnd } = setup(viewport)

      result.current.pageDownOrNext()

      expect(viewport.scrollTo).toHaveBeenCalledWith({
        top: 4000,
        behavior: "smooth",
      })
      expect(onPastEnd).not.toHaveBeenCalled()
    })

    it("advances to the next entry when already at the bottom", () => {
      const viewport = makeViewport({ scrollTop: 4000 })
      const { result, onPastEnd } = setup(viewport)

      result.current.pageDownOrNext()

      expect(onPastEnd).toHaveBeenCalledOnce()
      expect(viewport.scrollTo).not.toHaveBeenCalled()
    })

    it("advances when within a few pixels of the bottom", () => {
      const viewport = makeViewport({ scrollTop: 3996 })
      const { result, onPastEnd } = setup(viewport)

      result.current.pageDownOrNext()

      expect(onPastEnd).toHaveBeenCalledOnce()
      expect(viewport.scrollTo).not.toHaveBeenCalled()
    })

    it("advances immediately for an article that fits on screen", () => {
      const viewport = makeViewport({ clientHeight: 1000, scrollHeight: 800 })
      const { result, onPastEnd } = setup(viewport)

      result.current.pageDownOrNext()

      expect(onPastEnd).toHaveBeenCalledOnce()
      expect(viewport.scrollTo).not.toHaveBeenCalled()
    })

    it("advances immediately when there is no content viewport", () => {
      const { result, onPastEnd } = setup(null)

      result.current.pageDownOrNext()

      expect(onPastEnd).toHaveBeenCalledOnce()
    })

    it("advances immediately when scroll position cannot be measured", () => {
      const viewport = makeViewport()
      const { result, onPastEnd } = setup(viewport, { measurable: false })

      result.current.pageDownOrNext()

      expect(onPastEnd).toHaveBeenCalledOnce()
      expect(viewport.scrollTo).not.toHaveBeenCalled()
    })
  })

  describe("in-flight smooth scrolls", () => {
    it("pages from the pending target while a scroll is still animating", () => {
      const viewport = makeViewport()
      const { result } = setup(viewport)

      result.current.pageDownOrNext()
      // Animation has barely started; live scrollTop lags well behind.
      viewport.moveTo(120)
      result.current.pageDownOrNext()

      expect(viewport.scrollTo).toHaveBeenNthCalledWith(2, {
        top: 1800,
        behavior: "smooth",
      })
    })

    it("does not skip to the next entry when rapid presses outrun the animation", () => {
      const viewport = makeViewport({ clientHeight: 1000, scrollHeight: 2000 })
      const { result, onPastEnd } = setup(viewport)

      // One press reaches the bottom; a second press arrives mid-animation.
      result.current.pageDownOrNext()
      expect(viewport.scrollTo).toHaveBeenCalledWith({
        top: 900,
        behavior: "smooth",
      })
      viewport.moveTo(200)
      result.current.pageDownOrNext()

      expect(onPastEnd).not.toHaveBeenCalled()
      expect(viewport.scrollTo).toHaveBeenNthCalledWith(2, {
        top: 1000,
        behavior: "smooth",
      })
    })

    it("reads the live position again once the scroll lands", () => {
      const viewport = makeViewport()
      const { result } = setup(viewport)

      result.current.pageDownOrNext()
      landScroll(viewport)
      // Reader scrolls back up with the wheel after the animation settles.
      viewport.moveTo(300)
      result.current.pageDownOrNext()

      expect(viewport.scrollTo).toHaveBeenNthCalledWith(2, {
        top: 1200,
        behavior: "smooth",
      })
    })

    it("drops the pending target when the reader scrolls elsewhere mid-animation", () => {
      const viewport = makeViewport({ scrollTop: 1000 })
      const { result } = setup(viewport)

      result.current.pageDownOrNext()
      // Wheel scroll backwards cancels the smooth scroll to 1900.
      viewport.moveTo(400)
      result.current.pageDownOrNext()

      expect(viewport.scrollTo).toHaveBeenNthCalledWith(2, {
        top: 1300,
        behavior: "smooth",
      })
    })

    it("discards pending state when the entry changes", () => {
      const viewport = makeViewport()
      const { result, rerender, onPastEnd } = setup(viewport, { resetKey: 1 })

      result.current.pageDownOrNext()
      // New entry renders, viewport is reset to the top.
      viewport.moveTo(0)
      viewport.scrollHeight = 900
      rerender({ measurable: undefined, resetKey: 2 })

      result.current.pageDownOrNext()

      expect(onPastEnd).toHaveBeenCalledOnce()
      expect(viewport.scrollTo).toHaveBeenCalledOnce()
    })
  })

  describe("pageUpOrPrevious", () => {
    it("pages up within a long article without navigating", () => {
      const viewport = makeViewport({ scrollTop: 2000 })
      const { result, onPastStart } = setup(viewport)

      result.current.pageUpOrPrevious()

      expect(viewport.scrollTo).toHaveBeenCalledWith({
        top: 1100,
        behavior: "smooth",
      })
      expect(onPastStart).not.toHaveBeenCalled()
    })

    it("stops at the top rather than overshooting", () => {
      const viewport = makeViewport({ scrollTop: 500 })
      const { result, onPastStart } = setup(viewport)

      result.current.pageUpOrPrevious()

      expect(viewport.scrollTo).toHaveBeenCalledWith({
        top: 0,
        behavior: "smooth",
      })
      expect(onPastStart).not.toHaveBeenCalled()
    })

    it("goes to the previous entry when already at the top", () => {
      const viewport = makeViewport({ scrollTop: 0 })
      const { result, onPastStart } = setup(viewport)

      result.current.pageUpOrPrevious()

      expect(onPastStart).toHaveBeenCalledOnce()
      expect(viewport.scrollTo).not.toHaveBeenCalled()
    })

    it("goes to the previous entry when scroll position cannot be measured", () => {
      const viewport = makeViewport({ scrollTop: 2000 })
      const { result, onPastStart } = setup(viewport, { measurable: false })

      result.current.pageUpOrPrevious()

      expect(onPastStart).toHaveBeenCalledOnce()
      expect(viewport.scrollTo).not.toHaveBeenCalled()
    })
  })

  describe("pageDown / pageUp", () => {
    it("pages down without ever navigating", () => {
      const viewport = makeViewport({ scrollTop: 4000 })
      const { result, onPastEnd } = setup(viewport)

      result.current.pageDown()

      expect(onPastEnd).not.toHaveBeenCalled()
      expect(viewport.scrollTo).not.toHaveBeenCalled()
    })

    it("pages up without ever navigating", () => {
      const viewport = makeViewport({ scrollTop: 0 })
      const { result, onPastStart } = setup(viewport)

      result.current.pageUp()

      expect(onPastStart).not.toHaveBeenCalled()
      expect(viewport.scrollTo).not.toHaveBeenCalled()
    })

    it("shares pending scroll state with the space-key handlers", () => {
      const viewport = makeViewport()
      const { result } = setup(viewport)

      result.current.pageDown()
      result.current.pageDownOrNext()

      expect(viewport.scrollTo).toHaveBeenNthCalledWith(2, {
        top: 1800,
        behavior: "smooth",
      })
    })

    it("does nothing when there is no content viewport", () => {
      const { result } = setup(null)

      expect(() => result.current.pageDown()).not.toThrow()
      expect(() => result.current.pageUp()).not.toThrow()
    })
  })
})
