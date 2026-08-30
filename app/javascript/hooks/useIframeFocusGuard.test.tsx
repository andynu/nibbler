import { render, screen, fireEvent, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import {
  useIframeFocusGuard,
  HANDOFF_POLL_INTERVAL_MS,
} from "./useIframeFocusGuard"

interface HarnessProps {
  enabled: boolean
  resetKey: number
  /**
   * happy-dom fires a `load` on every iframe it mounts, a tick or two later.
   * The tests that are not about load handling leave the handler off so that
   * stray event cannot consume the first-load reclaim out from under them.
   */
  wireLoad: boolean
}

/**
 * Mirrors how EntryContent wires the guard: a focusable wrapper around the
 * frame, plus a button that appears only once the frame has taken focus.
 */
function Harness({ enabled, resetKey, wireLoad }: HarnessProps) {
  const guard = useIframeFocusGuard<HTMLDivElement>({ enabled, resetKey })

  return (
    <div>
      <button type="button">Elsewhere</button>
      {guard.keyboardHandedOff && (
        <button type="button" onClick={guard.reclaimKeyboard}>
          Restore shortcuts
        </button>
      )}
      {enabled && (
        <div ref={guard.anchorRef} tabIndex={-1} data-testid="anchor">
          <iframe
            ref={guard.frameRef}
            title="Embedded page"
            data-testid="frame"
            onLoad={wireLoad ? guard.handleFrameLoad : undefined}
          />
        </div>
      )}
    </div>
  )
}

function setup(props: Partial<HarnessProps> = {}) {
  const initial: HarnessProps = {
    enabled: true,
    resetKey: 1,
    wireLoad: false,
    ...props,
  }
  const view = render(<Harness {...initial} />)

  return {
    rerender: (next: Partial<HarnessProps>) =>
      view.rerender(<Harness {...initial} {...next} />),
    anchor: () => screen.queryByTestId("anchor"),
    frame: () => screen.getByTestId("frame"),
    elsewhere: () => screen.getByRole("button", { name: "Elsewhere" }),
    restore: () => screen.queryByRole("button", { name: "Restore shortcuts" }),
  }
}

/** The guard reads activeElement on the tick after the event; let it. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/**
 * The parent window blurring while the frame is the active element is the only
 * signal a cross-origin handoff gives off. happy-dom does not blur the window
 * on its own, so the event is dispatched here the way a browser would.
 */
async function handOffToFrame(frame: HTMLElement) {
  frame.focus()
  fireEvent.blur(window)
  await settle()
}

describe("useIframeFocusGuard", () => {
  describe("anchoring focus", () => {
    it("anchors focus in this document when the frame view opens", () => {
      const { anchor } = setup()

      expect(document.activeElement).toBe(anchor())
    })

    it("does nothing while no frame is on screen", () => {
      const { elsewhere } = setup({ enabled: false })

      expect(document.activeElement).not.toBe(elsewhere())
      expect(screen.queryByTestId("anchor")).not.toBeInTheDocument()
    })

    it("re-anchors focus on every entry navigation", async () => {
      const user = userEvent.setup()
      const { anchor, elsewhere, rerender } = setup()

      await user.click(elsewhere())
      expect(document.activeElement).toBe(elsewhere())

      rerender({ resetKey: 2 })

      expect(document.activeElement).toBe(anchor())
    })
  })

  describe("detecting the handoff", () => {
    it("reports the handoff once the embedded document takes focus", async () => {
      const { frame, restore } = setup()

      await handOffToFrame(frame())

      expect(restore()).toBeInTheDocument()
    })

    it("ignores a window blur that is not a handoff, such as a tab switch", async () => {
      const { restore } = setup()

      fireEvent.blur(window)
      await settle()

      expect(restore()).not.toBeInTheDocument()
    })

    it("clears the handoff when focus returns to this document", async () => {
      const user = userEvent.setup()
      const { frame, elsewhere, restore } = setup()

      await handOffToFrame(frame())
      expect(restore()).toBeInTheDocument()

      await user.click(elsewhere())
      await settle()

      expect(restore()).not.toBeInTheDocument()
    })

    it("reports the handoff from activeElement alone, with no event fired", async () => {
      vi.useFakeTimers()
      try {
        const { frame, restore } = setup()
        // Firefox moves focus into a cross-origin frame without announcing it:
        // activeElement becomes the iframe and no blur, focusout or focusin
        // fires (measured in both engines, see the hook). Setting the property
        // with no event is that browser, not a convenience.
        vi.spyOn(document, "activeElement", "get").mockReturnValue(frame())

        expect(restore()).not.toBeInTheDocument()

        await act(async () => {
          vi.advanceTimersByTime(HANDOFF_POLL_INTERVAL_MS)
        })

        expect(restore()).toBeInTheDocument()
      } finally {
        vi.restoreAllMocks()
        vi.useRealTimers()
      }
    })

    it("stops reading activeElement once no frame is on screen", async () => {
      vi.useFakeTimers()
      try {
        const { rerender } = setup()
        const reads = vi.spyOn(document, "activeElement", "get")

        await act(async () => {
          vi.advanceTimersByTime(HANDOFF_POLL_INTERVAL_MS * 3)
        })
        expect(reads).toHaveBeenCalled()

        rerender({ enabled: false })
        reads.mockClear()

        await act(async () => {
          vi.advanceTimersByTime(HANDOFF_POLL_INTERVAL_MS * 3)
        })

        expect(reads).not.toHaveBeenCalled()
      } finally {
        vi.restoreAllMocks()
        vi.useRealTimers()
      }
    })

    it("reclaims focus onto the anchor when asked", async () => {
      const user = userEvent.setup()
      const { frame, anchor, restore } = setup()

      await handOffToFrame(frame())

      await user.click(restore()!)
      await settle()

      expect(document.activeElement).toBe(anchor())
      expect(restore()).not.toBeInTheDocument()
    })
  })

  describe("frame loads", () => {
    it("takes focus back when the framed page grabs it on its first load", () => {
      const { frame, anchor } = setup({ wireLoad: true })

      frame().focus()
      fireEvent.load(frame())

      expect(document.activeElement).toBe(anchor())
    })

    it("releases the frame before taking focus back", () => {
      const { frame, anchor } = setup({ wireLoad: true })
      const released = vi.spyOn(frame(), "blur")

      frame().focus()
      fireEvent.load(frame())

      // Asserted as a call rather than through activeElement because a DOM
      // stub moves focus on `.focus()` alone and so cannot tell the two apart.
      // A real Firefox will not: with the frame focused and the anchor still
      // this document's remembered focus, `anchor.focus()` does nothing and
      // the reader keeps a dead keyboard. Releasing the frame is what moves it.
      expect(released).toHaveBeenCalled()
      expect(document.activeElement).toBe(anchor())
    })

    it("leaves the frame alone when it never had focus", () => {
      const { frame, elsewhere } = setup({ wireLoad: true })
      const released = vi.spyOn(frame(), "blur")

      elsewhere().focus()
      fireEvent.load(frame())

      expect(released).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(elsewhere())
    })

    it("leaves focus in the frame on later loads from in-page navigation", () => {
      const { frame, anchor } = setup({ wireLoad: true })

      fireEvent.load(frame())
      frame().focus()
      fireEvent.load(frame())

      expect(document.activeElement).toBe(frame())
      expect(document.activeElement).not.toBe(anchor())
    })

    it("treats the first load of the next entry as reclaimable again", () => {
      const { frame, anchor, rerender } = setup({ wireLoad: true })

      fireEvent.load(frame())
      rerender({ resetKey: 2 })

      frame().focus()
      fireEvent.load(frame())

      expect(document.activeElement).toBe(anchor())
    })
  })
})
