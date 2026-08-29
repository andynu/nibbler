import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { Dialog, DialogContent, DialogTitle } from "./dialog"

describe("DialogContent", () => {
  it("caps its height to the viewport and scrolls the overflow", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Tall dialog</DialogTitle>
        </DialogContent>
      </Dialog>
    )

    const content = screen.getByRole("dialog")

    expect(content).toHaveClass("max-h-[90dvh]", "overflow-y-auto")
  })

  it("lets a caller replace the cap and the overflow rule", () => {
    render(
      <Dialog open>
        <DialogContent className="max-h-[80vh] overflow-hidden">
          <DialogTitle>Self-managed dialog</DialogTitle>
        </DialogContent>
      </Dialog>
    )

    const content = screen.getByRole("dialog")

    expect(content).toHaveClass("max-h-[80vh]", "overflow-hidden")
    expect(content).not.toHaveClass("max-h-[90dvh]")
    expect(content).not.toHaveClass("overflow-y-auto")
  })
})
