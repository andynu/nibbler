import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react"

/** Finger travel, in px, that commits the gesture to a refresh. */
export const PULL_THRESHOLD = 80
/**
 * How far the indicator travels per px of finger travel. Below 1 so the pull
 * drags against the reader and reads as a gesture with a cost rather than a
 * sticky panel. It scales the indicator only; the threshold above is measured
 * on the finger, so the two constants can move independently.
 */
export const PULL_RESISTANCE = 0.4
/** Ceiling on the indicator's travel, in px. */
export const PULL_MAX = 120

interface PullToRefreshOptions {
  onRefresh: () => Promise<void>
  /** Finger travel, in px, that commits the gesture (default PULL_THRESHOLD). */
  threshold?: number
  /** Ceiling on the indicator's travel, in px (default PULL_MAX). */
  maxPull?: number
  enabled?: boolean
}

interface PullToRefreshState {
  isPulling: boolean
  pullDistance: number
  /**
   * The finger has travelled far enough that letting go now would refresh.
   * Reported rather than left to the caller to work out: the indicator has to
   * say "release" at exactly the point the gesture commits, and deriving that
   * from the threshold and the resistance a second time is how the two come to
   * disagree.
   */
  pastThreshold: boolean
  isRefreshing: boolean
}

/**
 * Pull down at the top of a scroller to refresh it.
 *
 * `containerRef` goes on the element that actually scrolls, not on a wrapper
 * around it: the gesture starts from `scrollTop === 0`, so a ref on a parent
 * whose own scrollTop is always 0 would arm the pull anywhere in the list. In
 * this app that element is the Radix ScrollArea's viewport, reached through
 * `<ScrollArea viewportRef={...}>` (EntryList).
 *
 * The document is not involved. `html` and `body` are `overflow: hidden`
 * (application.tailwind.css), so there is no document scroll to hook and no
 * browser-native pull-to-refresh to collide with; every scroller in the app is
 * a nested element. Measured against that markup in Chromium on a touch
 * viewport: a pull from the top reports every touchmove `cancelable`, so
 * preventDefault genuinely holds the list still, while a drag begun while the
 * list is already scrolling reports none of them cancelable. That asymmetry is
 * what the handlers below key off - a non-cancelable move is the browser
 * saying it has taken the gesture, and the pull lets go rather than drawing an
 * indicator over a scroll it cannot stop.
 *
 * Listeners bind once per container. Everything they read at event time lives
 * in a ref, synced in a layout effect, for the reason useKeyboardCommands
 * documents at length: a handler swapped in and out by a passive effect lags
 * the paint by a frame. Here it also keeps a touchmove off the React render
 * path entirely unless the pull distance really changed, which matters because
 * the list this hangs on can hold hundreds of rows and a touchmove arrives
 * every frame of every scroll.
 */
export function usePullToRefresh<T extends HTMLElement>(
  options: PullToRefreshOptions
): {
  containerRef: (node: T | null) => void
  state: PullToRefreshState
  indicatorStyle: React.CSSProperties
} {
  const { onRefresh, threshold = PULL_THRESHOLD, maxPull = PULL_MAX, enabled = true } = options

  // The container is state, not a ref, because the effect below has to re-run
  // when it arrives. The entry list swaps its ScrollArea contents between
  // loading, empty and populated branches, so the scroller is not necessarily
  // in the tree on the render that mounts this hook, and a ref would leave the
  // listeners unbound with nothing to trigger a retry.
  const [container, setContainer] = useState<T | null>(null)
  const containerRef = useCallback((node: T | null) => setContainer(node), [])

  const [state, setState] = useState<PullToRefreshState>({
    isPulling: false,
    pullDistance: 0,
    pastThreshold: false,
    isRefreshing: false,
  })

  const latest = useRef({ onRefresh, threshold, maxPull })
  useLayoutEffect(() => {
    latest.current = { onRefresh, threshold, maxPull }
  })

  const gesture = useRef({ startY: 0, tracking: false, travelled: 0 })
  const isRefreshing = useRef(false)

  useEffect(() => {
    if (!container || !enabled) return

    /**
     * Reaches React only when something the reader can see has changed. A
     * finger resting or scrolling at the top of the list produces a touchmove
     * a frame, and every one of those that reaches setState re-renders the
     * whole list for a gesture nobody is making.
     */
    const publish = (next: Partial<PullToRefreshState>) => {
      setState((prev) => {
        const merged = { ...prev, ...next }
        return prev.isPulling === merged.isPulling &&
          prev.pullDistance === merged.pullDistance &&
          prev.pastThreshold === merged.pastThreshold &&
          prev.isRefreshing === merged.isRefreshing
          ? prev
          : merged
      })
    }

    const abandon = () => {
      gesture.current.tracking = false
      gesture.current.travelled = 0
      publish({ isPulling: false, pullDistance: 0, pastThreshold: false })
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshing.current) return
      // A second finger is a pinch or a two-handed scroll, never a pull.
      if (e.touches.length !== 1) {
        abandon()
        return
      }
      if (container.scrollTop > 0) return

      gesture.current.startY = e.touches[0].clientY
      gesture.current.tracking = true
      gesture.current.travelled = 0
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!gesture.current.tracking || isRefreshing.current) return
      if (e.touches.length !== 1 || !e.cancelable || container.scrollTop > 0) {
        abandon()
        return
      }

      const deltaY = e.touches[0].clientY - gesture.current.startY
      if (deltaY <= 0) {
        // The reader is scrolling into the list. Keep tracking, in case the
        // finger comes back down within the same gesture, but draw nothing and
        // leave the scroll to the browser.
        gesture.current.travelled = 0
        publish({ isPulling: false, pullDistance: 0, pastThreshold: false })
        return
      }

      gesture.current.travelled = deltaY
      publish({
        isPulling: true,
        pullDistance: Math.min(deltaY * PULL_RESISTANCE, latest.current.maxPull),
        pastThreshold: deltaY >= latest.current.threshold,
      })
      e.preventDefault()
    }

    const handleTouchEnd = async () => {
      if (!gesture.current.tracking) return

      const travelled = gesture.current.travelled
      gesture.current.tracking = false
      gesture.current.travelled = 0

      if (travelled < latest.current.threshold || isRefreshing.current) {
        publish({ isPulling: false, pullDistance: 0, pastThreshold: false })
        return
      }

      isRefreshing.current = true
      publish({ isPulling: false, pullDistance: 0, pastThreshold: false, isRefreshing: true })
      try {
        await latest.current.onRefresh()
      } catch (error) {
        // The refresh reports its own failures; the gesture only has to stop
        // claiming to be running. Rethrowing would escape a touch handler as an
        // unhandled rejection with nothing left to catch it.
        console.error("Pull to refresh failed:", error)
      } finally {
        isRefreshing.current = false
        publish({ isRefreshing: false })
      }
    }

    container.addEventListener("touchstart", handleTouchStart, { passive: true })
    // Not passive: this is the listener that holds the list still during a pull.
    container.addEventListener("touchmove", handleTouchMove, { passive: false })
    container.addEventListener("touchend", handleTouchEnd, { passive: true })
    container.addEventListener("touchcancel", abandon, { passive: true })

    return () => {
      container.removeEventListener("touchstart", handleTouchStart)
      container.removeEventListener("touchmove", handleTouchMove)
      container.removeEventListener("touchend", handleTouchEnd)
      container.removeEventListener("touchcancel", abandon)
      // A container torn out mid-pull would otherwise leave the indicator
      // parked wherever the finger left it.
      abandon()
    }
  }, [container, enabled])

  const indicatorStyle: React.CSSProperties = {
    transform: `translateY(${state.pullDistance}px)`,
    transition: state.isPulling ? "none" : "transform 0.2s ease-out",
  }

  return { containerRef, state, indicatorStyle }
}
