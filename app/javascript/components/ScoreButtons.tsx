import { useState, useEffect, useLayoutEffect, useRef } from "react"
import { cn } from "@/lib/utils"

// Rainbow palette: Red, Orange, Green, Blue, Purple
// Each color has a border/text color and a filled background color
//
// Deliberately literal rather than theme tokens (ttrb-x7fn). The five colours
// encode an ordinal scale, so they have to stay distinguishable from each other
// and in the same order on every palette; deriving them per-theme would give
// five sets that a reader who switches themes has to relearn. Same reasoning as
// lib/tag-colors.ts.
const SCORE_COLORS: Record<number, { color: string; bg: string }> = {
  1: { color: "#cc0000", bg: "#cc0000" },     // Scarlet Red
  2: { color: "#f57900", bg: "#f57900" },     // Orange
  3: { color: "#4e9a06", bg: "#4e9a06" },     // Chameleon (Green)
  4: { color: "#3465a4", bg: "#3465a4" },     // Sky Blue
  5: { color: "#75507b", bg: "#75507b" },     // Plum (Purple, same tone as blue)
}

// The ordinal scale itself, in display order. Exported because the toolbar is
// not the only place a reader picks a score: below Tailwind's sm the control is
// hidden and EntryActionsMenu offers the same five values as menu rows. One
// array so the two cannot disagree about what the scale is.
export const SCORE_VALUES = [1, 2, 3, 4, 5] as const

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

  // Handle keyboard shortcuts.
  //
  // One listener, registered at mount, whose identity never changes. It closes
  // over nothing and reads the props out of a ref at event time. Same shape and
  // same reasoning as hooks/useKeyboardCommands.ts, which carries the long
  // version: layout effects run inside the commit phase, synchronously and
  // strictly before the browser may paint, so whenever the screen shows render
  // N the ref already holds render N.
  //
  // The straightforward version - a useCallback over `score` and
  // `onScoreChange` swapped in by a useEffect - had a window, because passive
  // effects run after paint (ttrb-fuky). What arrived in that window here was
  // not a dropped press but a misdirected write: `onScoreChange` in
  // application.tsx is a fresh arrow over the current `selectedEntry`, and
  // `loadEntry` is async, so the next entry's score paints when the response
  // lands. A digit pressed at that moment ran the previous render's closure and
  // scored the entry the reader had just navigated away from.
  const latest = useRef({ score, onScoreChange, keyboardEnabled })

  useLayoutEffect(() => {
    latest.current = { score, onScoreChange, keyboardEnabled }
  })

  useLayoutEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { score, onScoreChange, keyboardEnabled } = latest.current

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
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  const buttonSize = size === "sm" ? "h-5 min-w-5 text-xs" : "h-6 min-w-6 text-sm"

  const handleScoreClick = (newScore: number) => {
    onScoreChange(newScore)
    setIsExpanded(false)
  }

  const handleCollapsedClick = () => {
    setIsExpanded(true)
  }

  // Collapsed state: show single filled colored number
  if (!isExpanded && score > 0) {
    const colors = SCORE_COLORS[score] || SCORE_COLORS[1]
    return (
      <button
        className={cn(
          "font-bold flex items-center justify-center transition-opacity hover:opacity-80 rounded-sm",
          buttonSize
        )}
        style={{
          backgroundColor: colors.bg,
          color: "white",
        }}
        onClick={handleCollapsedClick}
        aria-label={`Score: ${score}. Click to change.`}
        title={`Score: ${score}. Press 1-5 to change, 0 to clear.`}
      >
        {score}
      </button>
    )
  }

  // Expanded state: show all 5 buttons in a button group
  // Unselected = outline style, Selected = filled background
  return (
    <div className="inline-flex rounded-sm overflow-hidden border border-border">
      {SCORE_VALUES.map((n) => {
        const colors = SCORE_COLORS[n]
        const isActive = n === score
        return (
          <button
            key={n}
            className={cn(
              "font-bold flex items-center justify-center transition-all border-r border-border last:border-r-0",
              buttonSize,
              !isActive && "hover:bg-accent/50"
            )}
            style={isActive ? {
              backgroundColor: colors.bg,
              color: "white",
            } : {
              color: colors.color,
              backgroundColor: "transparent",
            }}
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
  const badgeSize = size === "sm" ? "h-4 min-w-4 text-[10px]" : "h-5 min-w-5 text-xs"

  return (
    <span
      className={cn(
        "rounded-sm font-bold flex items-center justify-center shrink-0",
        badgeSize
      )}
      style={{
        backgroundColor: colors.bg,
        color: "white",
      }}
      aria-label={`Score: ${score}`}
    >
      {score}
    </span>
  )
}
