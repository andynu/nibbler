import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { useAltKeyHeld } from "./useAltKeyHeld"

describe("useAltKeyHeld", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns false initially", () => {
    const { result } = renderHook(() => useAltKeyHeld())
    expect(result.current).toBe(false)
  })

  it("returns true when Alt key is pressed", () => {
    const { result } = renderHook(() => useAltKeyHeld())

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt" }))
    })

    expect(result.current).toBe(true)
  })

  it("returns false when Alt key is released", () => {
    const { result } = renderHook(() => useAltKeyHeld())

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt" }))
    })

    expect(result.current).toBe(true)

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt" }))
    })

    expect(result.current).toBe(false)
  })

  it("resets to false on window blur", () => {
    const { result } = renderHook(() => useAltKeyHeld())

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt" }))
    })

    expect(result.current).toBe(true)

    act(() => {
      window.dispatchEvent(new Event("blur"))
    })

    expect(result.current).toBe(false)
  })

  it("ignores non-Alt keys", () => {
    const { result } = renderHook(() => useAltKeyHeld())

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control" }))
    })

    expect(result.current).toBe(false)

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }))
    })

    expect(result.current).toBe(false)
  })

  it("cleans up event listeners on unmount", () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener")

    const { unmount } = renderHook(() => useAltKeyHeld())

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith("keyup", expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith("blur", expect.any(Function))

    removeEventListenerSpy.mockRestore()
  })
})
