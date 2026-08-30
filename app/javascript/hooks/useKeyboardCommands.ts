import { useLayoutEffect, useRef } from "react"

export interface KeyboardCommand {
  key: string
  handler: () => void
  description: string
  modifiers?: {
    ctrl?: boolean
    shift?: boolean
    alt?: boolean
    meta?: boolean
  }
}

function isInputElement(element: EventTarget | null): boolean {
  if (!element || !(element instanceof HTMLElement)) return false
  const tagName = element.tagName.toLowerCase()
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    element.isContentEditable
  )
}

function matchesModifiers(
  event: KeyboardEvent,
  modifiers?: KeyboardCommand["modifiers"]
): boolean {
  const expected = modifiers || {}
  return (
    !!event.ctrlKey === !!expected.ctrl &&
    !!event.shiftKey === !!expected.shift &&
    !!event.altKey === !!expected.alt &&
    !!event.metaKey === !!expected.meta
  )
}

/**
 * Bind a list of keyboard commands to the document for as long as the calling
 * component is mounted.
 *
 * One listener is registered on mount and the same function object stays
 * registered until unmount. It never closes over `commands` or `enabled`; it
 * reads both out of a ref at event time. That is what makes the binding
 * correct rather than merely usually correct.
 *
 * The straightforward version - a `useCallback` over `commands` swapped in and
 * out by a `useEffect` - drops keys (ttrb-lix7). Passive effects run *after*
 * the browser paints, so between the paint of render N and the flush of render
 * N's effects the screen shows N while the live listener is still N-1's
 * closure. A key arriving in that window is handled against the previous
 * render's state, and in this app that meant `handleKeyboardNext` returning at
 * its `entries.length === 0` guard while the entry rows were plainly on screen.
 * Roughly 2 presses in 30 were lost when a press was issued the instant the
 * list painted.
 *
 * Both effects here are layout effects, which is the whole fix:
 *
 *  - The ref sync runs in the commit phase, in the same uninterrupted
 *    synchronous block that mutates the DOM and strictly before the browser is
 *    allowed to paint that mutation. So whenever the screen shows render N, the
 *    ref already holds render N. There is no window, not a smaller one.
 *  - Registration is a layout effect too, so the listener is live before the
 *    first paint rather than one frame after it.
 *
 * Doing the ref sync in a `useEffect` would reintroduce the original window.
 * Writing the ref during render would close it as well, but a render that React
 * abandons (a discarded transition, an offscreen prerender) would leave the ref
 * describing state that was never committed, so the commit phase is the correct
 * place.
 *
 * `enabled: false` keeps the listener attached and returns from it immediately.
 * Nothing observable hangs on the listener's presence, and not touching
 * registration is what keeps its identity stable.
 */
export function useKeyboardCommands(
  commands: KeyboardCommand[],
  enabled: boolean = true
): void {
  const latest = useRef({ commands, enabled })

  useLayoutEffect(() => {
    latest.current = { commands, enabled }
  })

  useLayoutEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const { commands, enabled } = latest.current
      if (!enabled) return
      if (isInputElement(event.target)) return

      for (const command of commands) {
        if (event.key === command.key && matchesModifiers(event, command.modifiers)) {
          event.preventDefault()
          command.handler()
          return
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [])
}
