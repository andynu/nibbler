import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useNavigationHistory, NavigationState } from "./useNavigationHistory"

describe("useNavigationHistory", () => {
  const mockHandlers = {
    onSelectFeed: vi.fn(),
    onSelectCategory: vi.fn(),
    onSelectVirtualFeed: vi.fn(),
    onShowSettings: vi.fn(),
    onShowSubscribe: vi.fn(),
  }

  let pushStateSpy: ReturnType<typeof vi.spyOn>
  let replaceStateSpy: ReturnType<typeof vi.spyOn>
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    pushStateSpy = vi.spyOn(window.history, "pushState")
    replaceStateSpy = vi.spyOn(window.history, "replaceState")
    addEventListenerSpy = vi.spyOn(window, "addEventListener")
    removeEventListenerSpy = vi.spyOn(window, "removeEventListener")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("event listener setup", () => {
    it("registers popstate event listener on mount", () => {
      renderHook(() => useNavigationHistory(mockHandlers))

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "popstate",
        expect.any(Function)
      )
    })

    it("removes event listener on unmount", () => {
      const { unmount } = renderHook(() => useNavigationHistory(mockHandlers))
      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "popstate",
        expect.any(Function)
      )
    })
  })

  describe("navigation functions", () => {
    it("navigateToFeed pushes feed state", () => {
      const { result } = renderHook(() => useNavigationHistory(mockHandlers))

      act(() => {
        result.current.navigateToFeed(123)
      })

      expect(pushStateSpy).toHaveBeenCalledWith(
        { type: "feed", feedId: 123 },
        ""
      )
    })

    it("navigateToCategory pushes category state", () => {
      const { result } = renderHook(() => useNavigationHistory(mockHandlers))

      act(() => {
        result.current.navigateToCategory(456)
      })

      expect(pushStateSpy).toHaveBeenCalledWith(
        { type: "category", categoryId: 456 },
        ""
      )
    })

    it("navigateToVirtualFeed pushes virtual feed state", () => {
      const { result } = renderHook(() => useNavigationHistory(mockHandlers))

      act(() => {
        result.current.navigateToVirtualFeed("starred")
      })

      expect(pushStateSpy).toHaveBeenCalledWith(
        { type: "virtual", virtualFeed: "starred" },
        ""
      )
    })

    it("navigateToRoot pushes root state when not already at root", () => {
      const { result } = renderHook(() => useNavigationHistory(mockHandlers))

      // First navigate somewhere else
      act(() => {
        result.current.navigateToFeed(123)
      })

      pushStateSpy.mockClear()

      act(() => {
        result.current.navigateToRoot()
      })

      expect(pushStateSpy).toHaveBeenCalledWith({ type: "root" }, "")
    })

    it("openSettings pushes settings dialog state", () => {
      const { result } = renderHook(() => useNavigationHistory(mockHandlers))

      act(() => {
        result.current.openSettings()
      })

      expect(pushStateSpy).toHaveBeenCalledWith(
        { type: "dialog", dialog: "settings", settingsTab: "feeds" },
        ""
      )
    })

    it("openSettings with tab pushes settings dialog state with specified tab", () => {
      const { result } = renderHook(() => useNavigationHistory(mockHandlers))

      act(() => {
        result.current.openSettings("preferences")
      })

      expect(pushStateSpy).toHaveBeenCalledWith(
        { type: "dialog", dialog: "settings", settingsTab: "preferences" },
        ""
      )
    })

    it("changeSettingsTab pushes state to enable back navigation between tabs", () => {
      const { result } = renderHook(() => useNavigationHistory(mockHandlers))

      // First open settings (this pushes initial state)
      act(() => {
        result.current.openSettings()
      })

      pushStateSpy.mockClear()

      act(() => {
        result.current.changeSettingsTab("filters")
      })

      expect(pushStateSpy).toHaveBeenCalledWith(
        { type: "dialog", dialog: "settings", settingsTab: "filters" },
        ""
      )
    })

    it("openSubscribe pushes subscribe dialog state", () => {
      const { result } = renderHook(() => useNavigationHistory(mockHandlers))

      act(() => {
        result.current.openSubscribe()
      })

      expect(pushStateSpy).toHaveBeenCalledWith(
        { type: "dialog", dialog: "subscribe" },
        ""
      )
    })

    it("closeDialogViaHistory calls history.back()", () => {
      const backSpy = vi.spyOn(window.history, "back")
      const { result } = renderHook(() => useNavigationHistory(mockHandlers))

      act(() => {
        result.current.closeDialogViaHistory()
      })

      expect(backSpy).toHaveBeenCalled()
    })
  })

  describe("duplicate state prevention", () => {
    it("does not push duplicate state", () => {
      const { result } = renderHook(() => useNavigationHistory(mockHandlers))

      act(() => {
        result.current.navigateToFeed(123)
      })

      expect(pushStateSpy).toHaveBeenCalledTimes(1)

      // Try to push the same state again
      act(() => {
        result.current.navigateToFeed(123)
      })

      expect(pushStateSpy).toHaveBeenCalledTimes(1)
    })

    it("allows different state after same-type navigation", () => {
      const { result } = renderHook(() => useNavigationHistory(mockHandlers))

      act(() => {
        result.current.navigateToFeed(123)
      })

      expect(pushStateSpy).toHaveBeenCalledTimes(1)

      act(() => {
        result.current.navigateToFeed(456)
      })

      expect(pushStateSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe("popstate handling", () => {
    function dispatchPopstate(state: NavigationState | null) {
      const event = new PopStateEvent("popstate", { state })
      window.dispatchEvent(event)
    }

    it("handles root state by clearing all selections", async () => {
      renderHook(() => useNavigationHistory(mockHandlers))

      await act(async () => {
        dispatchPopstate({ type: "root" })
        // Wait for microtask to complete
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(mockHandlers.onShowSettings).toHaveBeenCalledWith(false)
      expect(mockHandlers.onShowSubscribe).toHaveBeenCalledWith(false)
      expect(mockHandlers.onSelectFeed).toHaveBeenCalledWith(null)
      expect(mockHandlers.onSelectCategory).toHaveBeenCalledWith(null)
      expect(mockHandlers.onSelectVirtualFeed).toHaveBeenCalledWith(null)
    })

    it("handles null state the same as root", async () => {
      renderHook(() => useNavigationHistory(mockHandlers))

      await act(async () => {
        dispatchPopstate(null)
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(mockHandlers.onShowSettings).toHaveBeenCalledWith(false)
      expect(mockHandlers.onSelectFeed).toHaveBeenCalledWith(null)
    })

    it("handles feed state by selecting feed", async () => {
      renderHook(() => useNavigationHistory(mockHandlers))

      await act(async () => {
        dispatchPopstate({ type: "feed", feedId: 123 })
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(mockHandlers.onShowSettings).toHaveBeenCalledWith(false)
      expect(mockHandlers.onShowSubscribe).toHaveBeenCalledWith(false)
      expect(mockHandlers.onSelectFeed).toHaveBeenCalledWith(123)
    })

    it("handles category state by selecting category", async () => {
      renderHook(() => useNavigationHistory(mockHandlers))

      await act(async () => {
        dispatchPopstate({ type: "category", categoryId: 456 })
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(mockHandlers.onSelectCategory).toHaveBeenCalledWith(456)
    })

    it("handles virtual feed state", async () => {
      renderHook(() => useNavigationHistory(mockHandlers))

      await act(async () => {
        dispatchPopstate({ type: "virtual", virtualFeed: "fresh" })
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(mockHandlers.onSelectVirtualFeed).toHaveBeenCalledWith("fresh")
    })

    it("handles settings dialog state", async () => {
      renderHook(() => useNavigationHistory(mockHandlers))

      await act(async () => {
        dispatchPopstate({ type: "dialog", dialog: "settings", settingsTab: "filters" })
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(mockHandlers.onShowSettings).toHaveBeenCalledWith(true, "filters")
    })

    it("handles subscribe dialog state", async () => {
      renderHook(() => useNavigationHistory(mockHandlers))

      await act(async () => {
        dispatchPopstate({ type: "dialog", dialog: "subscribe" })
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(mockHandlers.onShowSubscribe).toHaveBeenCalledWith(true)
    })

    it("does not push state during popstate handling", async () => {
      const { result } = renderHook(() => useNavigationHistory(mockHandlers))

      // First, push a state to initialize
      act(() => {
        result.current.navigateToFeed(123)
      })

      pushStateSpy.mockClear()

      // Simulate popstate - should not trigger new pushState
      await act(async () => {
        dispatchPopstate({ type: "feed", feedId: 456 })
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(pushStateSpy).not.toHaveBeenCalled()
    })
  })
})
