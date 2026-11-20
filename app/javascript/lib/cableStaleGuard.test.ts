import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as ActionCable from "@rails/actioncable"
import { holdStaleReopenWhileHidden, type GuardableConnection } from "./cableStaleGuard"

interface RealMonitor {
  start(): void
  stop(): void
  reconnectIfStale(): void
}

// Exported at runtime, absent from @types/rails__actioncable.
const { ConnectionMonitor } = ActionCable as unknown as {
  ConnectionMonitor: new (connection: unknown) => RealMonitor
}

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "hidden", { configurable: true, value: state === "hidden" })
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state })
}

/**
 * The real ConnectionMonitor over a stand-in connection, so the test breaks if
 * Action Cable stops routing its poll through `reconnectIfStale`.
 */
function buildMonitoredConnection(open: boolean) {
  const connection = {
    isOpen: vi.fn(() => open),
    reopen: vi.fn(),
  } as unknown as GuardableConnection & { reopen: ReturnType<typeof vi.fn> }
  const monitor = new ConnectionMonitor(connection)
  connection.monitor = monitor
  return { connection, monitor }
}

describe("holdStaleReopenWhileHidden", () => {
  let monitors: { stop(): void }[] = []

  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility("visible")
    monitors = []
  })

  afterEach(() => {
    monitors.forEach((m) => m.stop())
    vi.useRealTimers()
    setVisibility("visible")
  })

  function started(open: boolean) {
    const built = buildMonitoredConnection(open)
    holdStaleReopenWhileHidden(built.connection)
    built.monitor.start()
    monitors.push(built.monitor)
    return built
  }

  it("leaves an open socket alone while the tab is hidden and no ping has been handled", () => {
    setVisibility("hidden")
    const { connection } = started(true)

    vi.advanceTimersByTime(60_000)

    expect(connection.reopen).not.toHaveBeenCalled()
  })

  it("still reconnects a closed socket while the tab is hidden", () => {
    setVisibility("hidden")
    const { connection } = started(false)

    vi.advanceTimersByTime(30_000)

    expect(connection.reopen).toHaveBeenCalled()
  })

  it("reopens a stale open socket while the tab is visible", () => {
    const { connection } = started(true)

    vi.advanceTimersByTime(30_000)

    expect(connection.reopen).toHaveBeenCalled()
  })

  it("reopens a stale socket when the tab comes back into view", () => {
    setVisibility("hidden")
    const { connection } = started(true)
    vi.advanceTimersByTime(60_000)
    expect(connection.reopen).not.toHaveBeenCalled()

    setVisibility("visible")
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }))
    vi.advanceTimersByTime(250)

    expect(connection.reopen).toHaveBeenCalledTimes(1)
  })
})
