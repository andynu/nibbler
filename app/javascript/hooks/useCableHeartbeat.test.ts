import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, beforeEach, vi } from "vitest"
import type { BaseMixin, ChannelNameWithParams } from "@rails/actioncable"

const { getConsumer, create, unsubscribe } = vi.hoisted(() => {
  const unsubscribe = vi.fn()
  const create = vi.fn(
    (_channel: string | ChannelNameWithParams, _mixin: BaseMixin) => ({ unsubscribe })
  )
  const consumer = { subscriptions: { create } }
  const getConsumer = vi.fn(() => consumer)
  return { getConsumer, create, unsubscribe }
})

vi.mock("@/lib/cable", () => ({ getConsumer, resetConsumer: vi.fn() }))

import {
  useCableHeartbeat,
  CABLE_STATE_ATTRIBUTE,
  CABLE_HEARTBEAT_ATTRIBUTE,
} from "./useCableHeartbeat"

function mixin(): BaseMixin {
  return create.mock.calls[0][1]
}

function attribute(name: string): string | null {
  return document.documentElement.getAttribute(name)
}

describe("useCableHeartbeat", () => {
  beforeEach(() => {
    create.mockClear()
    unsubscribe.mockClear()
    document.documentElement.removeAttribute(CABLE_STATE_ATTRIBUTE)
    document.documentElement.removeAttribute(CABLE_HEARTBEAT_ATTRIBUTE)
  })

  it("subscribes to the heartbeat channel once enabled", () => {
    renderHook(() => useCableHeartbeat(true))

    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0]).toBe("HeartbeatChannel")
  })

  // ApplicationCable::Connection rejects a socket with no session, so opening
  // one from the login screen buys a refused handshake and nothing else.
  it("opens no socket while signed out", () => {
    renderHook(() => useCableHeartbeat(false))

    expect(create).not.toHaveBeenCalled()
  })

  it("subscribes when sign-in completes", () => {
    const { rerender } = renderHook(({ enabled }) => useCableHeartbeat(enabled), {
      initialProps: { enabled: false },
    })

    rerender({ enabled: true })

    expect(create).toHaveBeenCalledTimes(1)
  })

  it("publishes the subscription state on the document element", () => {
    renderHook(() => useCableHeartbeat(true))
    expect(attribute(CABLE_STATE_ATTRIBUTE)).toBe("idle")

    act(() => mixin().connected?.({ reconnected: false }))

    expect(attribute(CABLE_STATE_ATTRIBUTE)).toBe("connected")
  })

  it("publishes the timestamp from the last message", () => {
    renderHook(() => useCableHeartbeat(true))

    act(() => mixin().received?.({ at: "2026-08-30T23:35:32Z" }))

    expect(attribute(CABLE_HEARTBEAT_ATTRIBUTE)).toBe("2026-08-30T23:35:32Z")
  })

  it("keeps only the most recent timestamp", () => {
    renderHook(() => useCableHeartbeat(true))

    act(() => mixin().received?.({ at: "2026-08-30T23:35:32Z" }))
    act(() => mixin().received?.({ at: "2026-08-30T23:36:32Z" }))

    expect(attribute(CABLE_HEARTBEAT_ATTRIBUTE)).toBe("2026-08-30T23:36:32Z")
  })

  it("says nothing about a heartbeat before one arrives", () => {
    renderHook(() => useCableHeartbeat(true))

    expect(attribute(CABLE_HEARTBEAT_ATTRIBUTE)).toBeNull()
  })

  // Both attributes are claims about a live connection; neither may outlive it.
  it("clears both attributes on unmount", () => {
    const { unmount } = renderHook(() => useCableHeartbeat(true))
    act(() => mixin().connected?.({ reconnected: false }))
    act(() => mixin().received?.({ at: "2026-08-30T23:35:32Z" }))

    unmount()

    expect(attribute(CABLE_STATE_ATTRIBUTE)).toBeNull()
    expect(attribute(CABLE_HEARTBEAT_ATTRIBUTE)).toBeNull()
  })

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useCableHeartbeat(true))

    unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
