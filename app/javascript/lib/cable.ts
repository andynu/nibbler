import { createConsumer, type Consumer } from "@rails/actioncable"

/**
 * The one Action Cable consumer for the whole app.
 *
 * A consumer is a websocket, not a subscription: every `createConsumer()` opens
 * another socket to /cable, and each one costs a Rails `ApplicationCable::
 * Connection` (a thread from Action Cable's worker pool, plus the database
 * lookup in `find_verified_user`) for as long as the tab is open. Subscriptions
 * are multiplexed over a single socket by design, so components ask for
 * subscriptions and share this.
 *
 * Nothing here connects at import time. `createConsumer` only builds the object;
 * the socket opens on the first `subscriptions.create`, which is why importing
 * this module from a component test does not reach for a websocket.
 */
let consumer: Consumer | null = null

export function getConsumer(): Consumer {
  consumer ??= createConsumer()
  return consumer
}

/**
 * Drop the shared consumer, closing its socket.
 *
 * The app never needs this -- one socket per tab is the point, and it should
 * live as long as the tab does. It exists so a test can start from no
 * connection, and so a future logout path has a way to stop identifying as a
 * user who has signed out.
 */
export function resetConsumer(): void {
  consumer?.disconnect()
  consumer = null
}
