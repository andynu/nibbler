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
    expect(screen.getByText("5")).toHaveStyle({ backgroundColor: "#06989a" })
  })
})
