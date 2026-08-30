import { useEffect, useRef, useState } from "react"
import type { ChannelNameWithParams, Subscription } from "@rails/actioncable"
import { getConsumer } from "@/lib/cable"

/**
 * Where a subscription is, from the client's point of view.
 *
 * "idle" covers both "not asked for" (a null channel) and "asked for, no answer
 * yet". "rejected" is the server refusing this channel for this connection;
 * unlike "disconnected" it will not resolve itself, because Action Cable does
 * not retry a rejected subscription.
 */
export type CableSubscriptionState = "idle" | "connected" | "disconnected" | "rejected"

export interface CableSubscriptionHandlers<T> {
  received?: (data: T) => void
  connected?: () => void
  disconnected?: () => void
  rejected?: () => void
}

/**
 * Subscribe to one Action Cable channel for as long as the component is mounted.
 *
 * Pass `null` as the channel to hold the subscription open-ended -- while the
 * auth state is still loading, say, or for a component that only wants the
 * socket once some feature is switched on. The hook is still called
 * unconditionally, so the rules of hooks are satisfied at every call site
 * without a wrapper component.
 *
 * Two things it deliberately does not do:
 *
 * - It does not resubscribe when `handlers` changes identity. Callers pass
 *   fresh closures on every render; the handlers are read from a ref at
 *   delivery time, so a re-render costs nothing on the wire.
 * - It does not disconnect the consumer on unmount, only `unsubscribe()`. The
 *   consumer is shared (see @/lib/cable), and tearing it down here would drop
 *   every other component's subscription.
 *
 * The channel identity is compared by value, not reference, so the common
 * `useCableSubscription({ channel: "X", id })` with an inline object literal
 * resubscribes when `id` moves and not otherwise.
 *
 * @param channel channel name, or a name plus params, or null to not subscribe
 * @param handlers callbacks for the subscription's lifecycle and messages
 * @returns the current state of this subscription
 */
export function useCableSubscription<T = unknown>(
  channel: string | ChannelNameWithParams | null,
  handlers: CableSubscriptionHandlers<T> = {}
): CableSubscriptionState {
  const [state, setState] = useState<CableSubscriptionState>("idle")
  const handlersRef = useRef(handlers)

  useEffect(() => {
    handlersRef.current = handlers
  })

  // Value identity, so an inline object literal does not restart the effect on
  // every render. JSON.stringify is enough: channel params are the identifiers
  // that go on the wire, so they are already JSON-serialisable.
  const channelKey = channel === null ? null : JSON.stringify(channel)

  useEffect(() => {
    if (channelKey === null) {
      setState("idle")
      return
    }

    let subscription: Subscription | null = null

    subscription = getConsumer().subscriptions.create(
      JSON.parse(channelKey) as string | ChannelNameWithParams,
      {
        connected() {
          setState("connected")
          handlersRef.current.connected?.()
        },
        disconnected() {
          setState("disconnected")
          handlersRef.current.disconnected?.()
        },
        rejected() {
          setState("rejected")
          handlersRef.current.rejected?.()
        },
        received(data: T) {
          handlersRef.current.received?.(data)
        },
      }
    )

    return () => {
      subscription?.unsubscribe()
      subscription = null
      setState("idle")
    }
  }, [channelKey])

  return state
}
