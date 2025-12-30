import { useEffect, useRef, useCallback } from "react"

interface SwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number // Minimum distance for swipe (px)
  velocityThreshold?: number // Minimum velocity for swipe (px/ms)
  enabled?: boolean
}

interface SwipeState {
  startX: number
  startY: number
  startTime: number
  isTracking: boolean
}

/**
 * Hook to detect horizontal swipe gestures for navigation.
 * Only triggers when swipe is primarily horizontal (to avoid conflicts with scrolling).
 */
export function useSwipeNavigation<T extends HTMLElement>(
  options: SwipeOptions
): React.RefObject<T | null> {
  const {
    onSwipeLeft,
    onSwipeRight,
    threshold = 50,
    velocityThreshold = 0.3,
    enabled = true,
  } = options

  const elementRef = useRef<T | null>(null)
  const stateRef = useRef<SwipeState>({
    startX: 0,
    startY: 0,
    startTime: 0,
    isTracking: false,
  })

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled || e.touches.length !== 1) return

    const touch = e.touches[0]
    stateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      isTracking: true,
    }
  }, [enabled])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!stateRef.current.isTracking) return

    const touch = e.touches[0]
    const deltaX = touch.clientX - stateRef.current.startX
    const deltaY = touch.clientY - stateRef.current.startY

    // If vertical movement exceeds horizontal, stop tracking (user is scrolling)
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      stateRef.current.isTracking = false
    }
  }, [])

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!stateRef.current.isTracking) return

    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - stateRef.current.startX
    const deltaY = touch.clientY - stateRef.current.startY
    const elapsed = Date.now() - stateRef.current.startTime

    stateRef.current.isTracking = false

    // Check if this is a valid horizontal swipe
    if (Math.abs(deltaY) > Math.abs(deltaX)) return // More vertical than horizontal
    if (Math.abs(deltaX) < threshold) return // Not far enough
    if (elapsed === 0) return // Avoid division by zero

    const velocity = Math.abs(deltaX) / elapsed
    if (velocity < velocityThreshold) return // Too slow

    // Trigger the appropriate callback
    if (deltaX > 0 && onSwipeRight) {
      onSwipeRight()
    } else if (deltaX < 0 && onSwipeLeft) {
      onSwipeLeft()
    }
  }, [onSwipeLeft, onSwipeRight, threshold, velocityThreshold])

  const handleTouchCancel = useCallback(() => {
    stateRef.current.isTracking = false
  }, [])

  useEffect(() => {
    const element = elementRef.current
    if (!element || !enabled) return

    element.addEventListener("touchstart", handleTouchStart, { passive: true })
    element.addEventListener("touchmove", handleTouchMove, { passive: true })
    element.addEventListener("touchend", handleTouchEnd, { passive: true })
    element.addEventListener("touchcancel", handleTouchCancel, { passive: true })

    return () => {
      element.removeEventListener("touchstart", handleTouchStart)
      element.removeEventListener("touchmove", handleTouchMove)
      element.removeEventListener("touchend", handleTouchEnd)
      element.removeEventListener("touchcancel", handleTouchCancel)
    }
  }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel])

  return elementRef
}
