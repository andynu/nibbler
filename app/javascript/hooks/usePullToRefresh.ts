import { useState, useEffect, useRef, useCallback } from "react"

interface PullToRefreshOptions {
  onRefresh: () => Promise<void>
  threshold?: number // Pull distance to trigger refresh (px)
  maxPull?: number // Maximum visual pull distance (px)
  enabled?: boolean
}

interface PullToRefreshState {
  isPulling: boolean
  pullDistance: number
  isRefreshing: boolean
}

/**
 * Hook to implement pull-to-refresh functionality.
 * Returns a ref to attach to the scrollable container and the current state.
 */
export function usePullToRefresh<T extends HTMLElement>(
  options: PullToRefreshOptions
): {
  containerRef: React.RefObject<T | null>
  state: PullToRefreshState
  indicatorStyle: React.CSSProperties
} {
  const {
    onRefresh,
    threshold = 80,
    maxPull = 120,
    enabled = true,
  } = options

  const containerRef = useRef<T | null>(null)
  const [state, setState] = useState<PullToRefreshState>({
    isPulling: false,
    pullDistance: 0,
    isRefreshing: false,
  })

  const touchStartY = useRef(0)
  const isPulling = useRef(false)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled || state.isRefreshing) return

    const container = containerRef.current
    if (!container) return

    // Only activate if scrolled to top
    if (container.scrollTop > 0) return

    touchStartY.current = e.touches[0].clientY
    isPulling.current = true
  }, [enabled, state.isRefreshing])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling.current || !enabled || state.isRefreshing) return

    const container = containerRef.current
    if (!container) return

    // If we've scrolled down, stop tracking
    if (container.scrollTop > 0) {
      isPulling.current = false
      setState((prev) => ({ ...prev, isPulling: false, pullDistance: 0 }))
      return
    }

    const currentY = e.touches[0].clientY
    const deltaY = currentY - touchStartY.current

    // Only track downward pulls
    if (deltaY <= 0) {
      setState((prev) => ({ ...prev, isPulling: false, pullDistance: 0 }))
      return
    }

    // Apply resistance for visual effect (pull feels natural)
    const resistance = 0.4
    const visualDistance = Math.min(deltaY * resistance, maxPull)

    setState((prev) => ({
      ...prev,
      isPulling: true,
      pullDistance: visualDistance,
    }))

    // Prevent default scrolling while pulling
    if (visualDistance > 0) {
      e.preventDefault()
    }
  }, [enabled, state.isRefreshing, maxPull])

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current || !enabled) return

    isPulling.current = false

    const wasOverThreshold = state.pullDistance >= threshold * 0.4 // Visual threshold is reduced due to resistance

    if (wasOverThreshold && !state.isRefreshing) {
      setState((prev) => ({ ...prev, isPulling: false, pullDistance: 0, isRefreshing: true }))

      try {
        await onRefresh()
      } finally {
        setState((prev) => ({ ...prev, isRefreshing: false }))
      }
    } else {
      setState((prev) => ({ ...prev, isPulling: false, pullDistance: 0 }))
    }
  }, [enabled, state.pullDistance, state.isRefreshing, threshold, onRefresh])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !enabled) return

    container.addEventListener("touchstart", handleTouchStart, { passive: true })
    container.addEventListener("touchmove", handleTouchMove, { passive: false })
    container.addEventListener("touchend", handleTouchEnd, { passive: true })

    return () => {
      container.removeEventListener("touchstart", handleTouchStart)
      container.removeEventListener("touchmove", handleTouchMove)
      container.removeEventListener("touchend", handleTouchEnd)
    }
  }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd])

  // Style for the pull indicator
  const indicatorStyle: React.CSSProperties = {
    transform: `translateY(${state.pullDistance}px)`,
    transition: state.isPulling ? "none" : "transform 0.2s ease-out",
  }

  return { containerRef, state, indicatorStyle }
}
