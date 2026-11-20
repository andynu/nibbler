import { describe, it, expect, beforeEach, vi } from "vitest"

const { createConsumer, disconnect, reconnectIfStale } = vi.hoisted(() => {
  const disconnect = vi.fn()
  const reconnectIfStale = vi.fn()
  const createConsumer = vi.fn(() => ({
    disconnect,
    subscriptions: { create: vi.fn() },
    connection: { isOpen: () => true, monitor: { reconnectIfStale } },
  }))
  return { createConsumer, disconnect, reconnectIfStale }
})

vi.mock("@rails/actioncable", () => ({ createConsumer }))

import { getConsumer, resetConsumer } from "./cable"

describe("cable", () => {
  beforeEach(() => {
    resetConsumer()
    createConsumer.mockClear()
    disconnect.mockClear()
  })

  // A consumer is a websocket and a server-side ApplicationCable::Connection,
  // so one per component would cost a socket and a User lookup per component.
  it("hands every caller the same consumer", () => {
    const first = getConsumer()
    const second = getConsumer()

    expect(first).toBe(second)
    expect(createConsumer).toHaveBeenCalledTimes(1)
  })

  it("does not open a connection at import time", async () => {
    vi.resetModules()
    createConsumer.mockClear()

    await import("./cable")

    expect(createConsumer).not.toHaveBeenCalled()
  })

  it("closes the socket when reset", () => {
    getConsumer()

    resetConsumer()

    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it("builds a fresh consumer after a reset", () => {
    const first = getConsumer()
    resetConsumer()

    expect(getConsumer()).not.toBe(first)
    expect(createConsumer).toHaveBeenCalledTimes(2)
  })

  it("holds the stale-socket reopen on the consumer it builds while the tab is hidden", () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" })
    try {
      const built = getConsumer() as unknown as {
        connection: { monitor: { reconnectIfStale(): void } }
      }
      reconnectIfStale.mockClear()

      built.connection.monitor.reconnectIfStale()

      expect(reconnectIfStale).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
    }
  })

  it("does not disconnect a consumer that was never built", () => {
    resetConsumer()

    expect(disconnect).not.toHaveBeenCalled()
  })
})
