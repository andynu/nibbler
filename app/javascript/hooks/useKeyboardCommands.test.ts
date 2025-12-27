import { renderHook } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useKeyboardCommands, KeyboardCommand } from "./useKeyboardCommands"

describe("useKeyboardCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Helper to dispatch a keyboard event
  function dispatchKeyDown(
    key: string,
    options: {
      ctrlKey?: boolean
      shiftKey?: boolean
      altKey?: boolean
      metaKey?: boolean
      target?: EventTarget
    } = {}
  ): KeyboardEvent {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ctrlKey: options.ctrlKey || false,
      shiftKey: options.shiftKey || false,
      altKey: options.altKey || false,
      metaKey: options.metaKey || false,
    })
    // Override target if provided
    if (options.target) {
      Object.defineProperty(event, "target", { value: options.target })
    }
    document.dispatchEvent(event)
    return event
  }

  describe("basic functionality", () => {
    it("registers keydown event listener on mount", () => {
      const addEventListenerSpy = vi.spyOn(document, "addEventListener")
      const handler = vi.fn()
      const commands: KeyboardCommand[] = [
        { key: "j", handler, description: "Next" },
      ]

      renderHook(() => useKeyboardCommands(commands))

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "keydown",
        expect.any(Function)
      )
    })

    it("removes event listener on unmount", () => {
      const removeEventListenerSpy = vi.spyOn(document, "removeEventListener")
      const handler = vi.fn()
      const commands: KeyboardCommand[] = [
        { key: "j", handler, description: "Next" },
      ]

      const { unmount } = renderHook(() => useKeyboardCommands(commands))
      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "keydown",
        expect.any(Function)
      )
    })

    it("calls handler when matching key is pressed", () => {
      const handler = vi.fn()
      const commands: KeyboardCommand[] = [
        { key: "j", handler, description: "Next" },
      ]

      renderHook(() => useKeyboardCommands(commands))
      dispatchKeyDown("j")

      expect(handler).toHaveBeenCalledOnce()
    })

    it("prevents default on matched keys", () => {
      const handler = vi.fn()
      const commands: KeyboardCommand[] = [
        { key: "j", handler, description: "Next" },
      ]

      renderHook(() => useKeyboardCommands(commands))
      const event = dispatchKeyDown("j")

      expect(event.defaultPrevented).toBe(true)
    })

    it("does not call handler when enabled is false", () => {
      const handler = vi.fn()
      const commands: KeyboardCommand[] = [
        { key: "j", handler, description: "Next" },
      ]

      renderHook(() => useKeyboardCommands(commands, false))
      dispatchKeyDown("j")

      expect(handler).not.toHaveBeenCalled()
    })

    it("does not call handler for non-matching keys", () => {
      const handler = vi.fn()
      const commands: KeyboardCommand[] = [
        { key: "j", handler, description: "Next" },
      ]

      renderHook(() => useKeyboardCommands(commands))
      dispatchKeyDown("k")

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe("input element filtering", () => {
    it("ignores keypresses when focus is on input", () => {
      const handler = vi.fn()
      const commands: KeyboardCommand[] = [
        { key: "j", handler, description: "Next" },
      ]
      const input = document.createElement("input")

      renderHook(() => useKeyboardCommands(commands))
      dispatchKeyDown("j", { target: input })

      expect(handler).not.toHaveBeenCalled()
    })

    it("ignores keypresses when focus is on textarea", () => {
      const handler = vi.fn()
      const commands: KeyboardCommand[] = [
        { key: "j", handler, description: "Next" },
      ]
      const textarea = document.createElement("textarea")

      renderHook(() => useKeyboardCommands(commands))
      dispatchKeyDown("j", { target: textarea })

      expect(handler).not.toHaveBeenCalled()
    })

    it("ignores keypresses when focus is on select", () => {
      const handler = vi.fn()
      const commands: KeyboardCommand[] = [
        { key: "j", handler, description: "Next" },
      ]
      const select = document.createElement("select")

      renderHook(() => useKeyboardCommands(commands))
      dispatchKeyDown("j", { target: select })

      expect(handler).not.toHaveBeenCalled()
    })

    it("ignores keypresses when focus is on contenteditable element", () => {
      const handler = vi.fn()
      const commands: KeyboardCommand[] = [
        { key: "j", handler, description: "Next" },
      ]
      // Create a mock element that appears to be contentEditable
      const div = document.createElement("div")
      Object.defineProperty(div, "isContentEditable", { value: true })

      renderHook(() => useKeyboardCommands(commands))
      dispatchKeyDown("j", { target: div })

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe("modifier key matching", () => {
    it("matches ctrl modifier correctly", () => {
      const handler = vi.fn()
      const commands: KeyboardCommand[] = [
        { key: "s", handler, description: "Save", modifiers: { ctrl: true } },
      ]

      renderHook(() => useKeyboardCommands(commands))

      // Without ctrl - should not match
      dispatchKeyDown("s")
      expect(handler).not.toHaveBeenCalled()

      // With ctrl - should match
      dispatchKeyDown("s", { ctrlKey: true })
      expect(handler).toHaveBeenCalledOnce()
    })

    it("matches shift modifier correctly", () => {
      const handler = vi.fn()
      const commands: KeyboardCommand[] = [
        { key: "J", handler, description: "Next category", modifiers: { shift: true } },
      ]

      renderHook(() => useKeyboardCommands(commands))

      // Without shift - should not match
      dispatchKeyDown("J")
      expect(handler).not.toHaveBeenCalled()

      // With shift - should match
      dispatchKeyDown("J", { shiftKey: true })
      expect(handler).toHaveBeenCalledOnce()
    })

    it("matches alt modifier correctly", () => {
      const handler = vi.fn()
      const commands: KeyboardCommand[] = [
        { key: "a", handler, description: "Alt action", modifiers: { alt: true } },
      ]

      renderHook(() => useKeyboardCommands(commands))

      // Without alt - should not match
      dispatchKeyDown("a")
      expect(handler).not.toHaveBeenCalled()

      // With alt - should match
      dispatchKeyDown("a", { altKey: true })
      expect(handler).toHaveBeenCalledOnce()
    })

    it("matches meta modifier correctly", () => {
      const handler = vi.fn()
      const commands: KeyboardCommand[] = [
        { key: "k", handler, description: "Command palette", modifiers: { meta: true } },
      ]

      renderHook(() => useKeyboardCommands(commands))

      // Without meta - should not match
      dispatchKeyDown("k")
      expect(handler).not.toHaveBeenCalled()

      // With meta - should match
      dispatchKeyDown("k", { metaKey: true })
      expect(handler).toHaveBeenCalledOnce()
    })

    it("rejects key if modifiers do not match", () => {
      const handler = vi.fn()
      const commands: KeyboardCommand[] = [
        { key: "j", handler, description: "Next" }, // No modifiers expected
      ]

      renderHook(() => useKeyboardCommands(commands))

      // With ctrl pressed - should not match since no modifiers expected
      dispatchKeyDown("j", { ctrlKey: true })
      expect(handler).not.toHaveBeenCalled()

      // Without any modifiers - should match
      dispatchKeyDown("j")
      expect(handler).toHaveBeenCalledOnce()
    })

    it("handles multiple modifiers", () => {
      const handler = vi.fn()
      const commands: KeyboardCommand[] = [
        {
          key: "S",
          handler,
          description: "Save all",
          modifiers: { ctrl: true, shift: true },
        },
      ]

      renderHook(() => useKeyboardCommands(commands))

      // Only ctrl - should not match
      dispatchKeyDown("S", { ctrlKey: true })
      expect(handler).not.toHaveBeenCalled()

      // Only shift - should not match
      dispatchKeyDown("S", { shiftKey: true })
      expect(handler).not.toHaveBeenCalled()

      // Both ctrl and shift - should match
      dispatchKeyDown("S", { ctrlKey: true, shiftKey: true })
      expect(handler).toHaveBeenCalledOnce()
    })
  })

  describe("edge cases", () => {
    it("handles empty commands array", () => {
      const commands: KeyboardCommand[] = []

      // Should not throw
      expect(() => {
        renderHook(() => useKeyboardCommands(commands))
        dispatchKeyDown("j")
      }).not.toThrow()
    })

    it("stops processing after first match", () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      const commands: KeyboardCommand[] = [
        { key: "j", handler: handler1, description: "First" },
        { key: "j", handler: handler2, description: "Second" },
      ]

      renderHook(() => useKeyboardCommands(commands))
      dispatchKeyDown("j")

      expect(handler1).toHaveBeenCalledOnce()
      expect(handler2).not.toHaveBeenCalled()
    })

    it("updates handlers when commands array changes", () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      const commands1: KeyboardCommand[] = [
        { key: "j", handler: handler1, description: "First handler" },
      ]
      const commands2: KeyboardCommand[] = [
        { key: "j", handler: handler2, description: "Second handler" },
      ]

      const { rerender } = renderHook(
        ({ commands }) => useKeyboardCommands(commands),
        { initialProps: { commands: commands1 } }
      )

      dispatchKeyDown("j")
      expect(handler1).toHaveBeenCalledOnce()
      expect(handler2).not.toHaveBeenCalled()

      // Update to new commands
      rerender({ commands: commands2 })

      dispatchKeyDown("j")
      expect(handler1).toHaveBeenCalledOnce() // Still only once
      expect(handler2).toHaveBeenCalledOnce()
    })

    it("re-registers listener when enabled changes from false to true", () => {
      const handler = vi.fn()
      const commands: KeyboardCommand[] = [
        { key: "j", handler, description: "Next" },
      ]

      const { rerender } = renderHook(
        ({ enabled }) => useKeyboardCommands(commands, enabled),
        { initialProps: { enabled: false } }
      )

      dispatchKeyDown("j")
      expect(handler).not.toHaveBeenCalled()

      // Enable
      rerender({ enabled: true })

      dispatchKeyDown("j")
      expect(handler).toHaveBeenCalledOnce()
    })
  })
})
