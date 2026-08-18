import { useCallback, useEffect, useMemo, useRef } from "react"

// Fraction of a viewport height moved per page, so a line or two carries over.
const PAGE_OVERLAP = 0.9
// Distance from the end of the content that still counts as "at the end".
const EDGE_THRESHOLD = 8
// Tolerance for deciding a smooth scroll has landed on its target.
const SETTLE_EPSILON = 2

interface PendingScroll {
  from: number
  target: number
}

export interface ContentPagingOptions {
  /** Viewport element that scrolls the article body. */
  scrollRef: React.RefObject<HTMLElement | null>
  /** Called when a page-down is requested but the content is already at the end. */
  onPastEnd: () => void
  /** Called when a page-up is requested but the content is already at the start. */
  onPastStart: () => void
  /**
   * False when scroll position cannot be measured (iframe view renders third-party
   * content), in which case the paging keys fall through to entry navigation.
   */
  measurable?: boolean
  /** Changing this discards in-flight scroll state, e.g. when a new entry renders. */
  resetKey?: unknown
}

export interface ContentPaging {
  pageDown: () => void
  pageUp: () => void
  pageDownOrNext: () => void
  pageUpOrPrevious: () => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function maxScrollTop(el: HTMLElement): number {
  return Math.max(0, el.scrollHeight - el.clientHeight)
}

export function useContentPaging({
  scrollRef,
  onPastEnd,
  onPastStart,
  measurable = true,
  resetKey,
}: ContentPagingOptions): ContentPaging {
  // Where the last requested smooth scroll is heading. Reading live scrollTop
  // mid-animation reports a stale position, which would make rapid presses
  // misjudge the end of the article and skip ahead an entry early.
  const pendingRef = useRef<PendingScroll | null>(null)

  useEffect(() => {
    pendingRef.current = null
  }, [resetKey, measurable])

  // Retire the pending target the moment the animation lands on it, so a wheel
  // scroll afterwards is not measured against a target that no longer applies.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const handleScroll = () => {
      const pending = pendingRef.current
      if (!pending) return
      if (Math.abs(el.scrollTop - pending.target) <= SETTLE_EPSILON) {
        pendingRef.current = null
      }
    }

    el.addEventListener("scroll", handleScroll, { passive: true })
    return () => el.removeEventListener("scroll", handleScroll)
  }, [scrollRef, resetKey, measurable])

  // Position to page from: the pending target while a scroll is animating,
  // otherwise the live position.
  const currentTop = useCallback((el: HTMLElement): number => {
    const pending = pendingRef.current
    if (!pending) return el.scrollTop

    const live = el.scrollTop
    if (Math.abs(live - pending.target) <= SETTLE_EPSILON) {
      pendingRef.current = null
      return live
    }

    // Content that shrank under the animation leaves a target the viewport can
    // never reach.
    if (pending.target > maxScrollTop(el)) {
      pendingRef.current = null
      return live
    }

    // A live position outside the animation's span means something else moved
    // the viewport (wheel, drag), so the pending target no longer applies.
    const low = Math.min(pending.from, pending.target) - SETTLE_EPSILON
    const high = Math.max(pending.from, pending.target) + SETTLE_EPSILON
    if (live < low || live > high) {
      pendingRef.current = null
      return live
    }

    return pending.target
  }, [])

  const scrollPage = useCallback(
    (direction: 1 | -1): void => {
      const el = scrollRef.current
      if (!el) return

      const from = currentTop(el)
      const target = clamp(
        from + direction * el.clientHeight * PAGE_OVERLAP,
        0,
        maxScrollTop(el)
      )
      if (Math.abs(target - from) < 1) return

      pendingRef.current = { from, target }
      el.scrollTo({ top: target, behavior: "smooth" })
    },
    [scrollRef, currentTop]
  )

  const pageDown = useCallback(() => scrollPage(1), [scrollPage])
  const pageUp = useCallback(() => scrollPage(-1), [scrollPage])

  const pageOrNavigate = useCallback(
    (direction: 1 | -1, navigate: () => void): void => {
      const el = scrollRef.current
      if (!measurable || !el) {
        navigate()
        return
      }

      const from = currentTop(el)
      const atEdge =
        direction === 1
          ? from >= maxScrollTop(el) - EDGE_THRESHOLD
          : from <= EDGE_THRESHOLD
      if (atEdge) {
        pendingRef.current = null
        navigate()
        return
      }

      scrollPage(direction)
    },
    [scrollRef, measurable, currentTop, scrollPage]
  )

  const pageDownOrNext = useCallback(
    () => pageOrNavigate(1, onPastEnd),
    [pageOrNavigate, onPastEnd]
  )
  const pageUpOrPrevious = useCallback(
    () => pageOrNavigate(-1, onPastStart),
    [pageOrNavigate, onPastStart]
  )

  return useMemo(
    () => ({ pageDown, pageUp, pageDownOrNext, pageUpOrPrevious }),
    [pageDown, pageUp, pageDownOrNext, pageUpOrPrevious]
  )
}
