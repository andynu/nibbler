/**
 * The slice of Action Cable's (untyped, internal) Connection this guard touches.
 * `monitor.reconnectIfStale` is what ConnectionMonitor's poll calls every 6-12 s.
 */
export interface GuardableConnection {
  isOpen(): boolean
  monitor: { reconnectIfStale(): void }
}

/**
 * Stop Action Cable from reopening a socket that is open, just because the tab
 * is hidden.
 *
 * ConnectionMonitor calls a connection stale when no message (the server pings
 * every 3 s) has been handled for 6 s, and reopens it. A hidden tab's event loop
 * is throttled, so a poll can run before the pings queued behind it are
 * handled: the socket is healthy, the monitor reopens it anyway, and every
 * reopen costs a reconnect refetch in useCountersNudge. Firefox does this to an
 * idle background tab roughly every 45 s.
 *
 * While hidden, an open socket is left alone. A closed one still goes through
 * the normal stale path, so a hidden tab reconnects after a deploy. On return
 * to the tab, ConnectionMonitor's own visibilitychange handler reopens the
 * socket if it really has gone quiet, after the queued pings have had 200 ms
 * to arrive.
 */
export function holdStaleReopenWhileHidden(connection: GuardableConnection): void {
  const { monitor } = connection
  const reconnectIfStale = monitor.reconnectIfStale.bind(monitor)

  monitor.reconnectIfStale = () => {
    if (document.visibilityState === "hidden" && connection.isOpen()) return
    reconnectIfStale()
  }
}
