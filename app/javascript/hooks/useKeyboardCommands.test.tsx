import { render, renderHook, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useLayoutEffect, useState } from "react"
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

  // The document picks up listeners from Testing Library and happy-dom too, so
  // narrow a spy's calls to the ones this hook made.
  function keydownCalls(spy: { mock: { calls: unknown[][] } }): unknown[][] {
    return spy.mock.calls.filter((call) => call[0] === "keydown")
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

    it("lets space type normally inside an input instead of paging", () => {
      const handler = vi.fn()
      const commands: KeyboardCommand[] = [
        { key: " ", handler, description: "Page down / next unread" },
      ]
      const input = document.createElement("input")

      renderHook(() => useKeyboardCommands(commands))
      const event = dispatchKeyDown(" ", { target: input })

      expect(handler).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(false)
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

    it("starts handling keys when enabled changes from false to true", () => {
      const addEventListenerSpy = vi.spyOn(document, "addEventListener")
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

      // Enabling does not re-register: the listener was attached at mount and
      // reads `enabled` at event time.
      expect(keydownCalls(addEventListenerSpy)).toHaveLength(1)
    })
  })

  // The listener used to be a useCallback over `commands`, swapped in and out
  // by a useEffect. Passive effects run after paint, so a key pressed in the
  // window between the paint of render N and the flush of render N's effects
  // reached render N-1's closure and was dropped (ttrb-lix7).
  //
  // These tests are about the listener lifecycle rather than about catching the
  // window in the act. If there is only ever one listener and it reads state
  // that is written in the commit phase, no such window exists at any timing.
  describe("stale listener window (ttrb-lix7)", () => {
    function nextCommand(handler: () => void): KeyboardCommand[] {
      return [{ key: "j", handler, description: "Next" }]
    }

    it("registers one listener on mount and never swaps it as commands change", () => {
      const addEventListenerSpy = vi.spyOn(document, "addEventListener")
      const removeEventListenerSpy = vi.spyOn(document, "removeEventListener")

      const { rerender } = renderHook(
        ({ commands }) => useKeyboardCommands(commands),
        { initialProps: { commands: nextCommand(vi.fn()) } }
      )

      // A fresh array holding a fresh closure on every render, which is what
      // application.tsx produces each time `entries` or `currentIndex` moves.
      for (let i = 0; i < 5; i++) {
        rerender({ commands: nextCommand(vi.fn()) })
      }

      expect(keydownCalls(addEventListenerSpy)).toHaveLength(1)
      expect(keydownCalls(removeEventListenerSpy)).toHaveLength(0)
    })

    it("routes through the mount-time listener to the newest handlers", () => {
      const addEventListenerSpy = vi.spyOn(document, "addEventListener")
      const first = vi.fn()
      const second = vi.fn()

      const { rerender } = renderHook(
        ({ commands }) => useKeyboardCommands(commands),
        { initialProps: { commands: nextCommand(first) } }
      )

      const registered = keydownCalls(addEventListenerSpy)[0][1] as EventListener
      rerender({ commands: nextCommand(second) })

      // Deliberately calls the function object captured at mount rather than
      // dispatching on the document, because that object is what a key press
      // reaches no matter how many renders have gone by.
      registered(new KeyboardEvent("keydown", { key: "j", cancelable: true }))

      expect(first).not.toHaveBeenCalled()
      expect(second).toHaveBeenCalledOnce()
    })

    it("handles a key that arrives after the commit but before effects flush", async () => {
      const user = userEvent.setup()
      const seen: number[] = []

      function Bound({ items }: { items: string[] }) {
        useKeyboardCommands([
          { key: "j", description: "Next", handler: () => seen.push(items.length) },
        ])
        return (
          <ul>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )
      }

      function Harness() {
        const [items, setItems] = useState<string[]>([])

        // A parent layout effect runs after every layout effect in the subtree
        // beneath it and before any passive effect anywhere, so it sits in the
        // same commit phase the browser paints at the end of. Pressing from
        // here is "the rows are on screen and no passive effect has run yet",
        // which is the state the dropped presses arrived in.
        useLayoutEffect(() => {
          if (items.length > 0) dispatchKeyDown("j")
        }, [items])

        return (
          <>
            <Bound items={items} />
            <button onClick={() => setItems(["a", "b"])}>load</button>
          </>
        )
      }

      render(<Harness />)
      await user.click(screen.getByRole("button", { name: "load" }))

      // [0] is the failure this ticket is about: the handler running against the
      // empty list of the render before the one on screen.
      expect(seen).toEqual([2])
    })
  })
})
