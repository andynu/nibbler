import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ScoreButtons, ScoreBadge } from "./ScoreButtons"

describe("ScoreButtons", () => {
  const mockOnScoreChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("expanded state (unscored)", () => {
    it("shows all 5 number buttons when score is 0", () => {
      render(<ScoreButtons score={0} onScoreChange={mockOnScoreChange} />)

      for (let i = 1; i <= 5; i++) {
        expect(screen.getByRole("button", { name: `Set score to ${i}` })).toBeInTheDocument()
      }
    })

    it("clicking a number button sets the score", async () => {
      const user = userEvent.setup()
      render(<ScoreButtons score={0} onScoreChange={mockOnScoreChange} />)

      await user.click(screen.getByRole("button", { name: "Set score to 3" }))

      expect(mockOnScoreChange).toHaveBeenCalledWith(3)
    })
  })

  describe("collapsed state (scored)", () => {
    it("shows single number button when score is set", () => {
      render(<ScoreButtons score={3} onScoreChange={mockOnScoreChange} />)

      expect(screen.getByRole("button", { name: /Score: 3/ })).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Set score to 1" })).not.toBeInTheDocument()
    })

    it("clicking collapsed button expands to show all buttons", async () => {
      const user = userEvent.setup()
      render(<ScoreButtons score={3} onScoreChange={mockOnScoreChange} />)

      await user.click(screen.getByRole("button", { name: /Score: 3/ }))

      for (let i = 1; i <= 5; i++) {
        expect(screen.getByRole("button", { name: `Set score to ${i}` })).toBeInTheDocument()
      }
    })
  })

  describe("keyboard shortcuts (when scored)", () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it("pressing 1-5 changes the score", async () => {
      const user = userEvent.setup()
      render(<ScoreButtons score={3} onScoreChange={mockOnScoreChange} keyboardEnabled={true} />)

      await user.keyboard("4")

      expect(mockOnScoreChange).toHaveBeenCalledWith(4)
    })

    it("pressing 0 clears the score", async () => {
      const user = userEvent.setup()
      render(<ScoreButtons score={3} onScoreChange={mockOnScoreChange} keyboardEnabled={true} />)

      await user.keyboard("0")

      expect(mockOnScoreChange).toHaveBeenCalledWith(0)
    })

    it("keyboard is disabled when score is 0", async () => {
      const user = userEvent.setup()
      render(<ScoreButtons score={0} onScoreChange={mockOnScoreChange} keyboardEnabled={true} />)

      await user.keyboard("3")

      expect(mockOnScoreChange).not.toHaveBeenCalled()
    })
  })

  // The listener used to be a useCallback over `score` and `onScoreChange`,
  // swapped in and out by a useEffect. Passive effects run after paint, so a
  // digit pressed between the paint of render N and the flush of render N's
  // effects reached render N-1's closure (ttrb-fuky, same class as ttrb-lix7).
  //
  // The stale closure here does not merely drop the press. `onScoreChange` in
  // application.tsx is `(score) => selectedEntry && handleSetScore(selectedEntry.id, score)`,
  // a fresh arrow over the current selection, and `loadEntry` is async, so the
  // new entry's score paints when the response lands. A digit pressed at that
  // moment ran the previous entry's `onScoreChange` and scored the entry the
  // reader had just navigated away from.
  //
  // These tests are about the listener lifecycle rather than about catching the
  // window in the act. If there is only ever one listener and it reads props
  // written in the commit phase, no such window exists at any timing.
  describe("stale listener window (ttrb-fuky)", () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    // Testing Library and happy-dom put listeners on the document too, so
    // narrow a spy's calls to the ones this component made.
    function keydownCalls(spy: { mock: { calls: unknown[][] } }): unknown[][] {
      return spy.mock.calls.filter((call) => call[0] === "keydown")
    }

    it("registers one listener on mount and never swaps it as props change", () => {
      const addEventListenerSpy = vi.spyOn(document, "addEventListener")
      const removeEventListenerSpy = vi.spyOn(document, "removeEventListener")

      const { rerender } = render(
        <ScoreButtons score={1} onScoreChange={vi.fn()} keyboardEnabled={true} />
      )

      // A fresh handler on every render, which is what EntryContent gets from
      // application.tsx's inline arrow, plus the score moving as entries load.
      for (let i = 1; i <= 5; i++) {
        rerender(
          <ScoreButtons score={i} onScoreChange={vi.fn()} keyboardEnabled={true} />
        )
      }

      expect(keydownCalls(addEventListenerSpy)).toHaveLength(1)
      expect(keydownCalls(removeEventListenerSpy)).toHaveLength(0)
    })

    it("routes through the mount-time listener to the newest score", () => {
      const addEventListenerSpy = vi.spyOn(document, "addEventListener")
      const first = vi.fn()
      const second = vi.fn()

      const { rerender } = render(
        <ScoreButtons score={2} onScoreChange={first} keyboardEnabled={true} />
      )
      const registered = keydownCalls(addEventListenerSpy)[0][1] as EventListener

      rerender(<ScoreButtons score={5} onScoreChange={second} keyboardEnabled={true} />)

      // Deliberately calls the function object captured at mount rather than
      // dispatching on the document, because that object is what a key press
      // reaches no matter how many renders have gone by.
      registered(new KeyboardEvent("keydown", { key: "2", cancelable: true }))

      // Stale: score 2 === the pressed 2, so the press was swallowed as a no-op
      // while the reader was looking at a 5.
      expect(second).toHaveBeenCalledExactlyOnceWith(2)
      expect(first).not.toHaveBeenCalled()
    })

    it("does not score the previous entry when the new one is unscored", () => {
      const addEventListenerSpy = vi.spyOn(document, "addEventListener")
      const previousEntry = vi.fn()
      const currentEntry = vi.fn()

      const { rerender } = render(
        <ScoreButtons score={3} onScoreChange={previousEntry} keyboardEnabled={true} />
      )
      const registered = keydownCalls(addEventListenerSpy)[0][1] as EventListener

      // j to an entry that has never been scored: the keyboard is meant to be
      // inert until the reader scores it by hand.
      rerender(<ScoreButtons score={0} onScoreChange={currentEntry} keyboardEnabled={true} />)

      registered(new KeyboardEvent("keydown", { key: "4", cancelable: true }))

      // Stale: score 3 passed the `score === 0` guard and the write landed on
      // the entry the reader had just left.
      expect(previousEntry).not.toHaveBeenCalled()
      expect(currentEntry).not.toHaveBeenCalled()
    })
  })
})

describe("ScoreBadge", () => {
  it("returns null when score is 0", () => {
    const { container } = render(<ScoreBadge score={0} />)

    expect(container.firstChild).toBeNull()
  })

  it("shows colored badge with score when score > 0", () => {
    render(<ScoreBadge score={3} />)

    const badge = screen.getByText("3")
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveAttribute("aria-label", "Score: 3")
  })

  it("applies correct color for each score level", () => {
    const { rerender } = render(<ScoreBadge score={1} />)
    expect(screen.getByText("1")).toHaveStyle({ backgroundColor: "#cc0000" })

    rerender(<ScoreBadge score={2} />)
    expect(screen.getByText("2")).toHaveStyle({ backgroundColor: "#f57900" })

    rerender(<ScoreBadge score={3} />)
    expect(screen.getByText("3")).toHaveStyle({ backgroundColor: "#4e9a06" })

    rerender(<ScoreBadge score={4} />)
    expect(screen.getByText("4")).toHaveStyle({ backgroundColor: "#3465a4" })

    rerender(<ScoreBadge score={5} />)
    expect(screen.getByText("5")).toHaveStyle({ backgroundColor: "#75507b" })
  })
})
