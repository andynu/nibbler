import { useEffect, useRef } from "react"

/** Default gap between polls, in milliseconds. */
export const BACKGROUND_REFRESH_INTERVAL_MS = 60_000

/**
 * Why `refresh` is being called: a scheduled tick, or a hidden tab coming back.
 *
 * Callers that ask for the same thing every time can ignore it. It exists for
 * callers that want a cheap poll in the steady state and a fuller reload when
 * the reader has been away and the tab may have missed arbitrary changes.
 */
export type BackgroundRefreshReason = "interval" | "visible"

export interface BackgroundRefreshOptions {
  /** Milliseconds between polls while the tab is visible. */
  intervalMs?: number
  /** Set false to suspend polling (e.g. while a dialog owns the data). */
  enabled?: boolean
}

/**
 * Re-run `refresh` on an interval while the tab is visible, and once more the
 * moment a hidden tab comes back.
 *
 * Server-side ingestion (the feed refresh job) changes counts with no client
 * event to hang a fetch off, so anything derived from those counts goes stale
 * until the reader happens to click something. This is the "ask again" side of
 * that: a poll for the idle-and-watching case, a visibility refresh for the
 * come-back-to-the-tab case (ttrb-7ktq).
 *
 * The timer only exists while the document is visible: it is torn down on hide
 * and rebuilt on show, so a backgrounded tab issues no requests at all rather
 * than firing and discarding them. Rebuilding also re-bases the interval, so
 * the visibility refresh and the next tick can't land back to back.
 *
 * Only `visibilitychange` is listened for, not window focus. A visible but
 * unfocused tab is still being polled, so its data is at most one interval old
 * when the reader clicks back into it.
 *
 * `refresh` is read from a ref at call time, so passing a new closure every
 * render is fine and does not restart the timer.
 *
 * @param refresh what to re-run; told which of the two occasions it is, return
 *   value ignored
 */
export function useBackgroundRefresh(
  refresh: (reason: BackgroundRefreshReason) => void,
  { intervalMs = BACKGROUND_REFRESH_INTERVAL_MS, enabled = true }: BackgroundRefreshOptions = {}
): void {
  const refreshRef = useRef(refresh)

  useEffect(() => {
    refreshRef.current = refresh
  })

  useEffect(() => {
    if (!enabled) return

    let timer: ReturnType<typeof setInterval> | null = null

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }

    const start = () => {
      stop()
      timer = setInterval(() => refreshRef.current("interval"), intervalMs)
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stop()
        return
      }
      refreshRef.current("visible")
      start()
    }

    if (!document.hidden) start()
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      stop()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [enabled, intervalMs])
}
