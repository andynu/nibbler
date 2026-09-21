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

/**
 * The controls a key activates by default, by key. A focused one answers the
 * key itself, so the commands must leave that key alone - but only that key,
 * which is why this is a per-key table rather than another clause in
 * `isInputElement`: j, k and the rest still have to work with a button focused.
 *
 * A control that prevents the default is already covered by the
 * `defaultPrevented` check, which is everything Radix manages. This is the
 * residue: the plain `<button onClick>` that handles no keys of its own. The
 * commands prevent the default when they match, so without this they do not
 * merely fire alongside the button, they stop it activating at all.
 *
 * Space is missing `a[href]` deliberately. On a link it scrolls rather than
 * following the link, and scrolling the article is what the Space command does.
 */
const ACTIVATION_TARGETS = new Map<string, string>([
  ["Enter", 'button, a[href], [role="button"]'],
  [" ", 'button, [role="button"]'],
])

function activatesTarget(event: KeyboardEvent): boolean {
  const selector = ACTIVATION_TARGETS.get(event.key)
  if (!selector) return false
  const target = event.target
  return target instanceof HTMLElement && target.matches(selector)
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

const withheldEvents = new WeakSet<Event>()

/**
 * Keep one key press from the commands without stopping its propagation, for a
 * control whose own handling of that key also listens on the document.
 *
 * A control that answers the key itself needs none of this: the commands skip
 * a press whose default has been prevented. This is for the one that has not
 * prevented it yet. dnd-kit's keyboard sensor reads a lifted row's keys from a
 * document listener it attaches on pickup, so it is still behind this one when
 * this one runs, and stopping propagation instead would starve it.
 */
export function withholdFromKeyboardCommands(event: Event): void {
  withheldEvents.add(event)
}

/**
 * Whether a press has been withheld, for a document listener that is a page
 * shortcut in its own right rather than an entry in the command list.
 * FeedOrganizer's tree navigation is one.
 */
export function isWithheldFromKeyboardCommands(event: Event): boolean {
  return withheldEvents.has(event)
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
      // A prevented default means the press has already been answered above
      // this listener. Radix's dismissable layers prevent Escape in a document
      // capture listener before they dismiss, and its menu items and triggers
      // prevent Enter and Space on the way up; without this the Escape that
      // closes a dialog or a menu also closed the open entry behind it.
      if (event.defaultPrevented) return
      if (withheldEvents.has(event)) return
      if (isInputElement(event.target)) return
      if (activatesTarget(event)) return

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
