import { useEffect, useCallback, useRef } from "react"

/**
 * Navigation state stored in browser history.
 * Represents the current view state of the app.
 */
export interface NavigationState {
  type: "feed" | "category" | "virtual" | "dialog" | "root"
  feedId?: number
  categoryId?: number
  virtualFeed?: "starred" | "fresh" | "published"
  dialog?: "settings" | "subscribe"
  settingsTab?: string
}

interface NavigationHandlers {
  onSelectFeed: (feedId: number | null) => void
  onSelectCategory: (categoryId: number | null) => void
  onSelectVirtualFeed: (feed: "starred" | "fresh" | "published" | null) => void
  onShowSettings: (show: boolean, tab?: string) => void
  onShowSubscribe: (show: boolean) => void
}

/**
 * Hook to manage browser history for navigation state.
 * Enables back button to return to previous views without changing URLs.
 */
export function useNavigationHistory(handlers: NavigationHandlers) {
  // Track if we're currently handling a popstate to prevent push loops
  const isHandlingPopstate = useRef(false)
  // Track the current state to avoid duplicate pushes
  const currentStateRef = useRef<NavigationState>({ type: "root" })

  // Push a new navigation state to history
  const pushState = useCallback((state: NavigationState) => {
    // Don't push if we're handling a popstate (restoring state)
    if (isHandlingPopstate.current) return

    // Don't push if the state is the same as current
    if (JSON.stringify(state) === JSON.stringify(currentStateRef.current)) return

    currentStateRef.current = state
    window.history.pushState(state, "")
  }, [])

  // Replace the current state without creating new history entry
  const replaceState = useCallback((state: NavigationState) => {
    currentStateRef.current = state
    window.history.replaceState(state, "")
  }, [])

  // Handle popstate events (back/forward button)
  useEffect(() => {
    const handlePopstate = (event: PopStateEvent) => {
      isHandlingPopstate.current = true

      const state = event.state as NavigationState | null

      if (!state || state.type === "root") {
        // At root state - clear all selections, close dialogs
        handlers.onShowSettings(false)
        handlers.onShowSubscribe(false)
        handlers.onSelectFeed(null)
        handlers.onSelectCategory(null)
        handlers.onSelectVirtualFeed(null)
        currentStateRef.current = { type: "root" }
      } else if (state.type === "dialog") {
        // Restore dialog state
        if (state.dialog === "settings") {
          handlers.onShowSettings(true, state.settingsTab)
        } else if (state.dialog === "subscribe") {
          handlers.onShowSubscribe(true)
        }
      } else {
        // Navigation state - close any dialogs first
        handlers.onShowSettings(false)
        handlers.onShowSubscribe(false)

        // Restore navigation
        if (state.type === "feed" && state.feedId) {
          handlers.onSelectFeed(state.feedId)
        } else if (state.type === "category" && state.categoryId) {
          handlers.onSelectCategory(state.categoryId)
        } else if (state.type === "virtual" && state.virtualFeed) {
          handlers.onSelectVirtualFeed(state.virtualFeed)
        }
        currentStateRef.current = state
      }

      // Allow future pushes after a microtask
      queueMicrotask(() => {
        isHandlingPopstate.current = false
      })
    }

    window.addEventListener("popstate", handlePopstate)
    return () => window.removeEventListener("popstate", handlePopstate)
  }, [handlers])

  // Navigation helpers that push state
  const navigateToFeed = useCallback(
    (feedId: number) => {
      pushState({ type: "feed", feedId })
    },
    [pushState]
  )

  const navigateToCategory = useCallback(
    (categoryId: number) => {
      pushState({ type: "category", categoryId })
    },
    [pushState]
  )

  const navigateToVirtualFeed = useCallback(
    (virtualFeed: "starred" | "fresh" | "published") => {
      pushState({ type: "virtual", virtualFeed })
    },
    [pushState]
  )

  const navigateToRoot = useCallback(() => {
    pushState({ type: "root" })
  }, [pushState])

  const openSettings = useCallback(
    (tab?: string) => {
      pushState({ type: "dialog", dialog: "settings", settingsTab: tab || "feeds" })
    },
    [pushState]
  )

  const changeSettingsTab = useCallback(
    (tab: string) => {
      // Push state for tab changes to enable back navigation between tabs
      pushState({ type: "dialog", dialog: "settings", settingsTab: tab })
    },
    [pushState]
  )

  const openSubscribe = useCallback(() => {
    pushState({ type: "dialog", dialog: "subscribe" })
  }, [pushState])

  // Close dialog by going back in history
  const closeDialogViaHistory = useCallback(() => {
    window.history.back()
  }, [])

  return {
    navigateToFeed,
    navigateToCategory,
    navigateToVirtualFeed,
    navigateToRoot,
    openSettings,
    changeSettingsTab,
    openSubscribe,
    closeDialogViaHistory,
    // Expose for cases where we need direct control
    pushState,
    replaceState,
  }
}
