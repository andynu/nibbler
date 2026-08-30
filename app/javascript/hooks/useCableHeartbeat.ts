import { useCallback, useEffect, useState } from "react"
import { useCableSubscription, type CableSubscriptionState } from "@/hooks/useCableSubscription"

export interface HeartbeatMessage {
  /** ISO 8601 timestamp, set by the process that broadcast (CableHeartbeatJob). */
  at: string
}

/** `data-cable` on <html>: the state of the app's cable subscription. */
export const CABLE_STATE_ATTRIBUTE = "data-cable"
/** `data-cable-heartbeat-at` on <html>: when the last heartbeat arrived. */
export const CABLE_HEARTBEAT_ATTRIBUTE = "data-cable-heartbeat-at"

/**
 * The app's proof of life for the push stack.
 *
 * This is not Action Cable's protocol ping, which only shows that the socket
 * between this tab and Puma is alive. It rides the whole path a real broadcast
 * takes: `CableHeartbeatJob` runs in the GoodJob worker process, writes to the
 * cable database through the solid_cable adapter, the web process's listener
 * thread picks the row up, and it arrives here. That is the path the `async`
 * adapter would break silently, since the job process would accept a broadcast
 * that no subscriber in that process could ever see.
 *
 * It has no UI. The result lands on <html> as `data-cable` (the subscription
 * state) and `data-cable-heartbeat-at` (the timestamp from the last message),
 * which is enough for `document.documentElement.dataset` in a console, for an
 * end-to-end test, and for the next channel to have something known-good to
 * compare against when it does not work.
 *
 * @param enabled false while signed out or still checking; no socket is opened
 * @returns the subscription state, also mirrored onto <html>
 */
export function useCableHeartbeat(enabled: boolean): CableSubscriptionState {
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<string | null>(null)

  const received = useCallback((message: HeartbeatMessage) => {
    setLastHeartbeatAt(message.at)
  }, [])

  const state = useCableSubscription<HeartbeatMessage>(
    enabled ? "HeartbeatChannel" : null,
    { received }
  )

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute(CABLE_STATE_ATTRIBUTE, state)
    return () => root.removeAttribute(CABLE_STATE_ATTRIBUTE)
  }, [state])

  useEffect(() => {
    const root = document.documentElement
    if (lastHeartbeatAt === null) return

    root.setAttribute(CABLE_HEARTBEAT_ATTRIBUTE, lastHeartbeatAt)
    // Also on unmount: a timestamp left on <html> by a component that no longer
    // exists reads as a live heartbeat, which is the one thing this must not
    // claim falsely.
    return () => root.removeAttribute(CABLE_HEARTBEAT_ATTRIBUTE)
  }, [lastHeartbeatAt])

  return state
}
