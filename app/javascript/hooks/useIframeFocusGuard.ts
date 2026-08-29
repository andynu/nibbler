import { useCallback, useEffect, useRef, useState } from "react"

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
 * Detection is the standard one: the parent window blurs while
 * `document.activeElement` is the iframe element. Switching applications or
 * tabs also blurs the window, but leaves `activeElement` alone, so the two
 * cases stay distinguishable.
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

    // activeElement settles after the blur handler returns, so read it on the
    // next tick rather than inside the event.
    const syncHandoff = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const frame = frameRef.current
        setKeyboardHandedOff(!!frame && document.activeElement === frame)
      }, 0)
    }

    window.addEventListener("blur", syncHandoff)
    window.addEventListener("focus", syncHandoff)
    document.addEventListener("focusin", syncHandoff)

    return () => {
      clearTimeout(timer)
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
