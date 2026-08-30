import { useCallback, useEffect, useRef, useState } from "react"

/**
 * How often `document.activeElement` is re-read while a frame is on screen.
 *
 * One read plus a reference compare costs 133ns in Chromium and 22ns in Firefox
 * (2M iterations, measured in each engine against a real cross-origin frame), so
 * ten reads a second is about 1.3 microseconds of CPU per second in the more
 * expensive engine. The interval is set by how long the reader should sit in
 * front of a dead keyboard before the way back appears, not by the cost.
 */
export const HANDOFF_POLL_INTERVAL_MS = 100

export interface IframeFocusGuard<T extends HTMLElement> {
  /**
   * Attach to the element that should hold keyboard focus on the reader's
   * behalf. It must be focusable, so give it `tabIndex={-1}`.
   */
  anchorRef: React.RefObject<T | null>
  /** Attach to the iframe whose focus is being watched. */
  frameRef: React.RefObject<HTMLIFrameElement | null>
  /**
   * True while the embedded document holds focus, which is when keydown events
   * stop reaching the reader's own listeners.
   */
  keyboardHandedOff: boolean
  /** Pull focus out of the frame and back onto the anchor. */
  reclaimKeyboard: () => void
  /** Wire to the iframe's `onLoad`. */
  handleFrameLoad: () => void
}

export interface IframeFocusGuardOptions {
  /** False whenever no iframe is on screen; the guard then does nothing. */
  enabled: boolean
  /**
   * Changes once per entry navigation. Each change re-anchors focus and lets the
   * next frame load count as that entry's first.
   */
  resetKey?: string | number | null
}

/**
 * Keeps keyboard control in the reader while a third-party page is embedded.
 *
 * Keydown events do not cross a document boundary, so the moment focus moves
 * into the iframe every shortcut registered on the parent document stops
 * firing. Nothing can pull focus back out of a cross-origin document without a
 * gesture in the parent, so this hook does two things instead:
 *
 * 1. Anchors focus on a parent element after every entry navigation and after
 *    the first load of each embedded page, which covers the common j-j-j walk
 *    and the framed pages that focus themselves on load.
 * 2. Reports the handoff when it happens anyway (the reader clicks a link or
 *    scrolls by clicking inside the frame) so the UI can offer a way back.
 *
 * The handoff is detected by reading `document.activeElement` on a timer, not
 * by listening for an event, because in one of the two engines there is no
 * event to listen for. The same click into a cross-origin frame, instrumented
 * identically in both:
 *
 *   Chromium  focusout on the anchor, then window blur, both with
 *             activeElement already the IFRAME
 *   Firefox   nothing. No blur, no focusout, no focusin, no focus event on the
 *             iframe element. The anchor's own focusout is deferred until focus
 *             comes back to this document, so it arrives on the way out rather
 *             than on the way in and cannot be used either.
 *
 * `document.hasFocus()` and `document.visibilityState` stay `true` and
 * `visible` throughout in both engines, so neither separates the states.
 * `document.activeElement` is the one signal both engines do produce: both set
 * it to the iframe element, Firefox simply never announces it. Polling it is
 * therefore the whole of the detection, and it is the same code in both
 * engines rather than a branch.
 *
 * The event listeners are kept for latency, not for detection. Where an engine
 * does fire something the handoff is reported on that event instead of up to
 * HANDOFF_POLL_INTERVAL_MS later; where it does not, the poll covers it.
 *
 * Switching applications or tabs leaves `activeElement` alone, so it stays
 * distinguishable from a handoff under either path.
 */
export function useIframeFocusGuard<T extends HTMLElement = HTMLElement>({
  enabled,
  resetKey = null,
}: IframeFocusGuardOptions): IframeFocusGuard<T> {
  const anchorRef = useRef<T | null>(null)
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const frameLoadHandled = useRef(false)
  const [keyboardHandedOff, setKeyboardHandedOff] = useState(false)

  const reclaimKeyboard = useCallback(() => {
    setKeyboardHandedOff(false)

    // Releasing the frame is what actually moves focus back across the
    // boundary. Firefox will not hand focus to a parent element it already
    // considers this document's focused element, and the anchor usually is
    // one: the guard parks focus there on every entry navigation, and then the
    // embedded page focuses itself, leaving the frame with the keys while the
    // anchor is still the document's remembered focus. `anchorRef.focus()` is
    // then a no-op and the reader is stuck. Measured in that state:
    // anchor.focus() leaves activeElement on the IFRAME, so does
    // anchor.blur() + anchor.focus(), and frame.blur() + anchor.focus()
    // returns it to the anchor. Chromium does not need this and is unaffected
    // by it.
    if (document.activeElement === frameRef.current) {
      frameRef.current?.blur()
    }
    anchorRef.current?.focus({ preventScroll: true })
  }, [])

  // Re-anchor on every entry navigation so a frame that grabbed focus on the
  // previous entry does not keep it across the swap.
  useEffect(() => {
    setKeyboardHandedOff(false)
    frameLoadHandled.current = false
    if (!enabled) return

    anchorRef.current?.focus({ preventScroll: true })
  }, [enabled, resetKey])

  useEffect(() => {
    if (!enabled) return

    let timer: ReturnType<typeof setTimeout> | undefined

    const readHandoff = () => {
      const frame = frameRef.current
      setKeyboardHandedOff(!!frame && document.activeElement === frame)
    }

    // activeElement settles after the blur handler returns, so read it on the
    // next tick rather than inside the event.
    const syncHandoff = () => {
      clearTimeout(timer)
      timer = setTimeout(readHandoff, 0)
    }

    window.addEventListener("blur", syncHandoff)
    window.addEventListener("focus", syncHandoff)
    document.addEventListener("focusin", syncHandoff)

    // Runs only while a frame is on screen: this effect is gated on `enabled`,
    // which the caller ties to the frame being rendered, and the interval is
    // cleared on the way out.
    const poll = setInterval(readHandoff, HANDOFF_POLL_INTERVAL_MS)

    return () => {
      clearTimeout(timer)
      clearInterval(poll)
      window.removeEventListener("blur", syncHandoff)
      window.removeEventListener("focus", syncHandoff)
      document.removeEventListener("focusin", syncHandoff)
    }
  }, [enabled])

  const handleFrameLoad = useCallback(() => {
    // Only the first load of an entry's page is ours to interrupt. Later loads
    // are the reader navigating inside the frame, and yanking focus out from
    // under that would be worse than losing the shortcuts.
    if (frameLoadHandled.current) return
    frameLoadHandled.current = true

    if (document.activeElement !== frameRef.current) return
    reclaimKeyboard()
  }, [reclaimKeyboard])

  return {
    anchorRef,
    frameRef,
    keyboardHandedOff,
    reclaimKeyboard,
    handleFrameLoad,
  }
}
