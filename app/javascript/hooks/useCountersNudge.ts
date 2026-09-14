import { useCallback, useEffect, useRef } from "react"
import { useCableSubscription, type CableSubscriptionState } from "@/hooks/useCableSubscription"

/**
 * How long a nudge waits before refetching, so a burst of them costs one request.
 *
 * The refresh cron enqueues one job per due feed and several run at once, so a
 * reader with a few busy feeds is nudged several times within seconds. A nudge
 * carries no numbers, so collapsing a burst loses nothing.
 */
export const COUNTERS_NUDGE_COALESCE_MS = 2_000

/** What CountersChannel sends. The content is never read; arrival is the message. */
export interface CountersNudgeMessage {
  stale: true
}

export interface CountersNudgeOptions {
  /**
   * Set false to hold refetches while something else owns the data. The
   * subscription stays open, and a nudge that arrives meanwhile is replayed
   * once when this goes back to true.
   */
  enabled?: boolean
  /** Milliseconds to wait after the first nudge of a burst. */
  coalesceMs?: number
}

/**
 * Refetch the sidebar counters when the server says they have moved.
 *
 * UpdateFeedJob broadcasts on CountersChannel when a fetch stores entries for
 * this reader. The broadcast is a nudge rather than the counts, so GET
 * /api/v1/counters stays the only source of the numbers, including the Fresh
 * count, whose window only this tab knows.
 *
 * A socket that drops and reconnects does not replay what it missed, so a
 * reconnect counts as a nudge. The first connect does not: counters already
 * load on mount.
 *
 * This sits beside useBackgroundRefresh rather than replacing it. A hidden tab
 * still refetches when it comes back, and the poll covers changes no broadcast
 * reports, such as read state set on another device or entries ageing out of
 * the Fresh window.
 *
 * `refresh` is read from a ref at call time, so a new closure every render is
 * fine and does not resubscribe.
 *
 * @param refresh what to re-run; return value ignored
 * @returns the subscription state
 */
export function useCountersNudge(
  refresh: () => void,
  { enabled = true, coalesceMs = COUNTERS_NUDGE_COALESCE_MS }: CountersNudgeOptions = {}
): CableSubscriptionState {
  const refreshRef = useRef(refresh)
  const coalesceRef = useRef(coalesceMs)
  const enabledRef = useRef(enabled)
  // A holder rather than the timer id itself, so unmount cleanup can read the
  // id that is current then, not the one captured when the effect ran.
  const pending = useRef<{ timer: ReturnType<typeof setTimeout> | null }>({ timer: null })
  const missedWhileDisabled = useRef(false)
  const hasDisconnected = useRef(false)

  useEffect(() => {
    refreshRef.current = refresh
    coalesceRef.current = coalesceMs
  })

  const schedule = useCallback(() => {
    const holder = pending.current
    if (holder.timer !== null) return

    holder.timer = setTimeout(() => {
      holder.timer = null
      if (enabledRef.current) {
        refreshRef.current()
      } else {
        missedWhileDisabled.current = true
      }
    }, coalesceRef.current)
  }, [])

  useEffect(() => {
    enabledRef.current = enabled
    if (enabled && missedWhileDisabled.current) {
      missedWhileDisabled.current = false
      refreshRef.current()
    }
  }, [enabled])

  useEffect(() => {
    const holder = pending.current
    return () => {
      if (holder.timer !== null) clearTimeout(holder.timer)
      holder.timer = null
    }
  }, [])

  return useCableSubscription<CountersNudgeMessage>("CountersChannel", {
    received: () => schedule(),
    disconnected: () => {
      hasDisconnected.current = true
    },
    connected: () => {
      if (hasDisconnected.current) schedule()
    },
  })
}
