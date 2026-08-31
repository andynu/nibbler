import { render, act } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { usePullToRefresh, PULL_THRESHOLD, PULL_RESISTANCE } from "./usePullToRefresh"

/**
 * The gesture is measured in raw finger travel, so a pull that must cross the
 * threshold has to move further than the threshold itself. Everything below
 * moves in multiples of it rather than in pixels, so the numbers stay right if
 * the constant moves.
 */
const PAST_THRESHOLD = PULL_THRESHOLD + 40
const SHORT_OF_THRESHOLD = PULL_THRESHOLD - 40

function touchEvent(
  type: string,
  clientYs: number[],
  { cancelable = true }: { cancelable?: boolean } = {}
): TouchEvent {
  const points = clientYs.map((clientY) => ({ clientX: 100, clientY })) as unknown as Touch[]
  return new TouchEvent(type, {
    bubbles: true,
    cancelable,
    touches: type === "touchend" || type === "touchcancel" ? [] : points,
    changedTouches: points,
  })
}

interface HarnessProps {
  onRefresh: () => Promise<void>
  enabled?: boolean
  /**
   * The scroller is rendered conditionally so a test can attach it after the
   * hook has already mounted, which is what the entry list does whenever it
   * swaps between the loading, empty and populated branches.
   */
  mounted?: boolean
  onRender?: () => void
}

let harness: {
  state: {
    isPulling: boolean
    pullDistance: number
    pastThreshold: boolean
    isRefreshing: boolean
  }
  indicatorStyle: React.CSSProperties
}

function Harness({ onRefresh, enabled = true, mounted = true, onRender }: HarnessProps) {
  const pull = usePullToRefresh<HTMLDivElement>({ onRefresh, enabled })
  harness = { state: pull.state, indicatorStyle: pull.indicatorStyle }
  onRender?.()

  return mounted ? (
    <div ref={pull.containerRef} data-testid="scroller">
      <div data-testid="row">entry</div>
    </div>
  ) : null
}

function scroller(): HTMLElement {
  const el = document.querySelector('[data-testid="scroller"]')
  if (!el) throw new Error("scroller is not mounted")
  return el as HTMLElement
}

/** Drives one touch sequence, one event per frame, the way a finger would. */
async function pullBy(
  distance: number,
  {
    startY = 100,
    steps = 8,
    fingers = 1,
    endWith = "touchend" as "touchend" | "touchcancel",
    el = null as HTMLElement | null,
  } = {}
) {
  const target = el ?? scroller()
  const start = Array.from({ length: fingers }, (_, i) => startY + i * 30)

  await act(async () => {
    target.dispatchEvent(touchEvent("touchstart", start))
  })

  for (let step = 1; step <= steps; step++) {
    const y = startY + (distance * step) / steps
    const points = Array.from({ length: fingers }, (_, i) => y + i * 30)
    await act(async () => {
      target.dispatchEvent(touchEvent("touchmove", points))
    })
  }

  await act(async () => {
    target.dispatchEvent(touchEvent(endWith, [startY + distance]))
  })
}

type RefreshMock = ReturnType<typeof refreshMock>

const refreshMock = (impl: () => Promise<void> = () => Promise.resolve()) =>
  vi.fn<() => Promise<void>>(impl)

describe("usePullToRefresh", () => {
  let onRefresh: RefreshMock

  beforeEach(() => {
    onRefresh = refreshMock()
  })

  describe("the gesture that should refresh", () => {
    it("refreshes when the finger travels past the threshold from the top of the list", async () => {
      render(<Harness onRefresh={onRefresh} />)

      await pullBy(PAST_THRESHOLD)

      expect(onRefresh).toHaveBeenCalledTimes(1)
    })

    it("shows the pull as it happens, capped so it cannot be dragged off the screen", async () => {
      render(<Harness onRefresh={onRefresh} />)
      const target = scroller()

      await act(async () => {
        target.dispatchEvent(touchEvent("touchstart", [100]))
      })
      await act(async () => {
        target.dispatchEvent(touchEvent("touchmove", [200]))
      })

      expect(harness.state.isPulling).toBe(true)
      expect(harness.state.pullDistance).toBeCloseTo(100 * PULL_RESISTANCE, 5)
      expect(harness.indicatorStyle.transform).toBe(
        `translateY(${100 * PULL_RESISTANCE}px)`
      )

      // Far past the cap: the indicator stops, the gesture does not.
      await act(async () => {
        target.dispatchEvent(touchEvent("touchmove", [3000]))
      })
      expect(harness.state.pullDistance).toBeLessThanOrEqual(120)
    })

    it("picks up a gesture that starts on a row, which is where a thumb lands", async () => {
      render(<Harness onRefresh={onRefresh} />)
      const row = document.querySelector('[data-testid="row"]') as HTMLElement

      await pullBy(PAST_THRESHOLD, { el: row })

      expect(onRefresh).toHaveBeenCalledTimes(1)
    })

    it("says when letting go would refresh, on the finger's travel and not the indicator's", async () => {
      render(<Harness onRefresh={onRefresh} />)
      const target = scroller()

      await act(async () => {
        target.dispatchEvent(touchEvent("touchstart", [100]))
      })

      // One pixel short. The indicator has moved only a fraction of this,
      // which is why the caller must not be left to work the answer out from
      // the distance it can see.
      await act(async () => {
        target.dispatchEvent(touchEvent("touchmove", [100 + PULL_THRESHOLD - 1]))
      })
      expect(harness.state.pastThreshold).toBe(false)

      await act(async () => {
        target.dispatchEvent(touchEvent("touchmove", [100 + PULL_THRESHOLD]))
      })
      expect(harness.state.pastThreshold).toBe(true)
      expect(harness.state.pullDistance).toBeLessThan(PULL_THRESHOLD)

      await act(async () => {
        target.dispatchEvent(touchEvent("touchend", [100 + PULL_THRESHOLD]))
      })
      expect(harness.state.pastThreshold).toBe(false)
      expect(onRefresh).toHaveBeenCalledTimes(1)
    })

    it("reports itself as refreshing until the refresh settles", async () => {
      let settle: () => void = () => {}
      const slowRefresh = refreshMock(
        () => new Promise<void>((resolve) => { settle = resolve })
      )
      render(<Harness onRefresh={slowRefresh} />)

      await pullBy(PAST_THRESHOLD)
      expect(harness.state.isRefreshing).toBe(true)

      await act(async () => { settle() })
      expect(harness.state.isRefreshing).toBe(false)
    })

    it("clears the refreshing flag when the refresh rejects", async () => {
      const failingRefresh = refreshMock(() => Promise.reject(new Error("network")))
      render(<Harness onRefresh={failingRefresh} />)

      await pullBy(PAST_THRESHOLD).catch(() => {})

      expect(harness.state.isRefreshing).toBe(false)
    })
  })

  describe("the gestures that should not refresh", () => {
    it("ignores a pull that stops short of the threshold", async () => {
      render(<Harness onRefresh={onRefresh} />)

      await pullBy(SHORT_OF_THRESHOLD)

      expect(onRefresh).not.toHaveBeenCalled()
      expect(harness.state.pullDistance).toBe(0)
    })

    it("ignores a pull that starts away from the top of the list", async () => {
      render(<Harness onRefresh={onRefresh} />)
      scroller().scrollTop = 400

      await pullBy(PAST_THRESHOLD)

      expect(onRefresh).not.toHaveBeenCalled()
    })

    it("ignores an upward swipe, which is the reader scrolling into the list", async () => {
      render(<Harness onRefresh={onRefresh} />)

      await pullBy(-PAST_THRESHOLD, { startY: 400 })

      expect(onRefresh).not.toHaveBeenCalled()
    })

    it("ignores the gesture while disabled", async () => {
      render(<Harness onRefresh={onRefresh} enabled={false} />)

      await pullBy(PAST_THRESHOLD)

      expect(onRefresh).not.toHaveBeenCalled()
    })

    it("abandons the pull when the list scrolls out from under it mid-gesture", async () => {
      render(<Harness onRefresh={onRefresh} />)
      const target = scroller()

      await act(async () => {
        target.dispatchEvent(touchEvent("touchstart", [100]))
      })
      await act(async () => {
        target.dispatchEvent(touchEvent("touchmove", [140]))
      })
      target.scrollTop = 250
      await act(async () => {
        target.dispatchEvent(touchEvent("touchmove", [300]))
      })
      await act(async () => {
        target.dispatchEvent(touchEvent("touchend", [300]))
      })

      expect(onRefresh).not.toHaveBeenCalled()
      expect(harness.state.pullDistance).toBe(0)
    })

    it("does not start a second refresh while the first is still running", async () => {
      let settle: () => void = () => {}
      const slowRefresh = refreshMock(
        () => new Promise<void>((resolve) => { settle = resolve })
      )
      render(<Harness onRefresh={slowRefresh} />)

      await pullBy(PAST_THRESHOLD)
      await pullBy(PAST_THRESHOLD)

      expect(slowRefresh).toHaveBeenCalledTimes(1)

      await act(async () => { settle() })
    })
  })

  describe("gestures the browser is already handling", () => {
    /**
     * Chromium marks touchmove non-cancelable once it has committed the
     * sequence to scrolling, and preventDefault on such an event does nothing.
     * Measured on the real ScrollArea markup: a pull from the top reports all
     * moves cancelable, while a drag begun mid-scroll reports none of them. So
     * a non-cancelable move is the browser saying it owns this gesture, and the
     * pull has to let go of it rather than draw an indicator that fights a
     * scroll it cannot stop.
     */
    it("leaves a non-cancelable move to the browser", async () => {
      render(<Harness onRefresh={onRefresh} />)
      const target = scroller()

      await act(async () => {
        target.dispatchEvent(touchEvent("touchstart", [100]))
      })

      const move = touchEvent("touchmove", [100 + PAST_THRESHOLD], { cancelable: false })
      const preventDefault = vi.spyOn(move, "preventDefault")
      await act(async () => { target.dispatchEvent(move) })

      expect(preventDefault).not.toHaveBeenCalled()

      await act(async () => {
        target.dispatchEvent(touchEvent("touchend", [100 + PAST_THRESHOLD]))
      })
      expect(onRefresh).not.toHaveBeenCalled()
    })

    it("stops the browser scrolling a pull it is drawing", async () => {
      render(<Harness onRefresh={onRefresh} />)
      const target = scroller()

      await act(async () => {
        target.dispatchEvent(touchEvent("touchstart", [100]))
      })

      const move = touchEvent("touchmove", [200])
      await act(async () => { target.dispatchEvent(move) })

      expect(move.defaultPrevented).toBe(true)
    })

    it("ignores a two-finger gesture, which is a pinch and not a pull", async () => {
      render(<Harness onRefresh={onRefresh} />)

      await pullBy(PAST_THRESHOLD, { fingers: 2 })

      expect(onRefresh).not.toHaveBeenCalled()
    })

    it("drops the pull when the system cancels the touch", async () => {
      render(<Harness onRefresh={onRefresh} />)

      await pullBy(PAST_THRESHOLD, { endWith: "touchcancel" })

      expect(onRefresh).not.toHaveBeenCalled()
      expect(harness.state.pullDistance).toBe(0)
      expect(harness.state.isPulling).toBe(false)
    })
  })

  describe("what it costs the reader who is only scrolling", () => {
    /**
     * The list can hold hundreds of rows, and every touchmove that reaches
     * React re-renders all of them. A reader flicking through the list from the
     * top must not pay for a gesture they are not making, so a swipe that is
     * not a pull has to leave component state alone entirely.
     */
    it("does not re-render per frame while the reader scrolls away from the top", async () => {
      const count = async (steps: number) => {
        let renders = 0
        const view = render(
          <Harness onRefresh={onRefresh} onRender={() => { renders++ }} />
        )
        const before = renders
        await pullBy(-PAST_THRESHOLD, { startY: 600, steps })
        view.unmount()
        return renders - before
      }

      // The gesture is the same either way, so the render cost has to be the
      // same too. Tying it to the number of touchmoves is the defect: the
      // scroll fires one a frame, and each one that reaches setState rebuilds
      // every row in the list.
      const short = await count(12)
      const long = await count(48)

      expect(long).toBe(short)
      expect(long).toBeLessThanOrEqual(1)
    })
  })

  describe("binding to the scroll container", () => {
    /**
     * The entry list swaps its ScrollArea contents between loading, empty and
     * populated branches, so the scroller the hook has to listen on is not
     * necessarily in the tree on the render that mounts the hook.
     */
    it("binds to a container that appears after the hook mounts", async () => {
      const { rerender } = render(<Harness onRefresh={onRefresh} mounted={false} />)
      rerender(<Harness onRefresh={onRefresh} mounted />)

      await pullBy(PAST_THRESHOLD)

      expect(onRefresh).toHaveBeenCalledTimes(1)
    })

    it("stops listening to a container that leaves the tree", async () => {
      const { rerender } = render(<Harness onRefresh={onRefresh} />)
      const target = scroller()
      rerender(<Harness onRefresh={onRefresh} mounted={false} />)

      await pullBy(PAST_THRESHOLD, { el: target })

      expect(onRefresh).not.toHaveBeenCalled()
    })
  })
})
