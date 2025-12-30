import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react"

type Pane = "sidebar" | "list" | "content"
type Breakpoint = "mobile" | "tablet" | "desktop"

interface LayoutContextValue {
  // Current breakpoint
  breakpoint: Breakpoint
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean

  // Current visible pane (only matters on mobile/tablet)
  currentPane: Pane

  // Navigation between panes
  setCurrentPane: (pane: Pane) => void
  goToSidebar: () => void
  goToList: () => void
  goToContent: () => void
  goBack: () => void

  // For tracking navigation history on mobile
  canGoBack: boolean
}

const LayoutContext = createContext<LayoutContextValue | null>(null)

// Breakpoint values matching Tailwind defaults
const BREAKPOINTS = {
  sm: 640,  // Mobile -> Tablet
  lg: 1024, // Tablet -> Desktop
}

function getBreakpoint(width: number): Breakpoint {
  if (width < BREAKPOINTS.sm) return "mobile"
  if (width < BREAKPOINTS.lg) return "tablet"
  return "desktop"
}

// Define default pane for each breakpoint
function getDefaultPane(breakpoint: Breakpoint): Pane {
  switch (breakpoint) {
    case "mobile":
      return "list" // Show list by default on mobile
    case "tablet":
      return "list" // Show list + content on tablet
    case "desktop":
      return "list" // Show all panes on desktop
  }
}

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() =>
    typeof window !== "undefined" ? getBreakpoint(window.innerWidth) : "desktop"
  )
  const [currentPane, setCurrentPane] = useState<Pane>(() => getDefaultPane(breakpoint))
  const [paneHistory, setPaneHistory] = useState<Pane[]>([])

  // Update breakpoint on resize
  useEffect(() => {
    const handleResize = () => {
      const newBreakpoint = getBreakpoint(window.innerWidth)
      setBreakpoint((prev) => {
        if (prev !== newBreakpoint) {
          // Reset pane history when breakpoint changes
          setPaneHistory([])
          // Set default pane for new breakpoint
          setCurrentPane(getDefaultPane(newBreakpoint))
        }
        return newBreakpoint
      })
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const navigateToPane = useCallback((pane: Pane) => {
    setPaneHistory((prev) => [...prev, currentPane])
    setCurrentPane(pane)
  }, [currentPane])

  const goToSidebar = useCallback(() => {
    navigateToPane("sidebar")
  }, [navigateToPane])

  const goToList = useCallback(() => {
    navigateToPane("list")
  }, [navigateToPane])

  const goToContent = useCallback(() => {
    navigateToPane("content")
  }, [navigateToPane])

  const goBack = useCallback(() => {
    setPaneHistory((prev) => {
      if (prev.length === 0) return prev
      const newHistory = [...prev]
      const previousPane = newHistory.pop()!
      setCurrentPane(previousPane)
      return newHistory
    })
  }, [])

  const canGoBack = paneHistory.length > 0

  const value: LayoutContextValue = {
    breakpoint,
    isMobile: breakpoint === "mobile",
    isTablet: breakpoint === "tablet",
    isDesktop: breakpoint === "desktop",
    currentPane,
    setCurrentPane: navigateToPane,
    goToSidebar,
    goToList,
    goToContent,
    goBack,
    canGoBack,
  }

  return (
    <LayoutContext.Provider value={value}>
      {children}
    </LayoutContext.Provider>
  )
}

export function useLayout() {
  const context = useContext(LayoutContext)
  if (!context) {
    throw new Error("useLayout must be used within a LayoutProvider")
  }
  return context
}
