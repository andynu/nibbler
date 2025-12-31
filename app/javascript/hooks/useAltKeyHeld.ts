import { useState, useEffect } from "react"

/**
 * Hook to track whether the Alt key is currently held down.
 * Used for showing alternative counts in the sidebar.
 */
export function useAltKeyHeld(): boolean {
  const [altHeld, setAltHeld] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        setAltHeld(true)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        setAltHeld(false)
      }
    }

    // Handle window blur (user switches tabs while holding Alt)
    const handleBlur = () => {
      setAltHeld(false)
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", handleBlur)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", handleBlur)
    }
  }, [])

  return altHeld
}
