import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Tango-inspired rainbow palette (using medium variants for dark mode readability)
const SCORE_COLORS: Record<number, { bg: string; text: string; hoverBg: string }> = {
  1: { bg: "#cc0000", text: "white", hoverBg: "#a40000" },     // Scarlet Red
  2: { bg: "#f57900", text: "white", hoverBg: "#ce5c00" },     // Orange
  3: { bg: "#4e9a06", text: "white", hoverBg: "#3d7a05" },     // Chameleon (Green)
  4: { bg: "#3465a4", text: "white", hoverBg: "#204a87" },     // Sky Blue
  5: { bg: "#06989a", text: "white", hoverBg: "#058687" },     // Teal/Cyan (custom, between Sky Blue and Plum)
}

interface ScoreButtonsProps {
  score: number
  onScoreChange: (score: number) => void
  size?: "sm" | "md"
  keyboardEnabled?: boolean
}

export function ScoreButtons({
  score,
  onScoreChange,
  size = "md",
  keyboardEnabled = true,
}: ScoreButtonsProps) {
  const [isExpanded, setIsExpanded] = useState(score === 0)

  // Reset expanded state when score changes externally
  useEffect(() => {
    setIsExpanded(score === 0)
  }, [score])

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Only handle when not in an input/textarea
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return
    }

    // Only enable keyboard when scored (collapsed state)
    if (!keyboardEnabled || score === 0) return

    const key = e.key
    if (key >= "1" && key <= "5") {
      e.preventDefault()
      const newScore = parseInt(key, 10)
      if (newScore !== score) {
        onScoreChange(newScore)
      }
    } else if (key === "0") {
      e.preventDefault()
      onScoreChange(0)
      setIsExpanded(true)
    }
  }, [keyboardEnabled, score, onScoreChange])

  useEffect(() => {
    if (keyboardEnabled) {
      document.addEventListener("keydown", handleKeyDown)
      return () => document.removeEventListener("keydown", handleKeyDown)
    }
  }, [keyboardEnabled, handleKeyDown])

  const buttonSize = size === "sm" ? "h-5 w-5 text-xs" : "h-7 w-7 text-sm"

  const handleScoreClick = (newScore: number) => {
    onScoreChange(newScore)
    setIsExpanded(false)
  }

  const handleCollapsedClick = () => {
    setIsExpanded(true)
  }

  // Collapsed state: show single colored number
  if (!isExpanded && score > 0) {
    const colors = SCORE_COLORS[score] || SCORE_COLORS[1]
    return (
      <button
        className={cn(
          "rounded-sm font-bold flex items-center justify-center transition-opacity hover:opacity-80",
          buttonSize
        )}
        style={{
          backgroundColor: colors.bg,
          color: colors.text,
        }}
        onClick={handleCollapsedClick}
        aria-label={`Score: ${score}. Click to change.`}
        title={`Score: ${score}. Press 1-5 to change, 0 to clear.`}
      >
        {score}
      </button>
    )
  }

  // Expanded state: show all 5 buttons
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const colors = SCORE_COLORS[n]
        const isActive = n === score
        return (
          <button
            key={n}
            className={cn(
              "rounded-sm font-bold flex items-center justify-center transition-all",
              buttonSize,
              isActive ? "ring-2 ring-offset-1 ring-offset-background" : "opacity-70 hover:opacity-100"
            )}
            style={{
              backgroundColor: colors.bg,
              color: colors.text,
              "--tw-ring-color": colors.bg,
            } as React.CSSProperties}
            onClick={() => handleScoreClick(n)}
            aria-label={`Set score to ${n}`}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}

interface ScoreBadgeProps {
  score: number
  size?: "sm" | "md"
}

/**
 * Read-only score badge for list view.
 * Shows colored number only if score > 0.
 */
export function ScoreBadge({ score, size = "sm" }: ScoreBadgeProps) {
  if (score <= 0) return null

  const colors = SCORE_COLORS[score] || SCORE_COLORS[1]
  const badgeSize = size === "sm" ? "h-4 w-4 text-[10px]" : "h-5 w-5 text-xs"

  return (
    <span
      className={cn(
        "rounded-sm font-bold flex items-center justify-center shrink-0",
        badgeSize
      )}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
      }}
      aria-label={`Score: ${score}`}
    >
      {score}
    </span>
  )
}
