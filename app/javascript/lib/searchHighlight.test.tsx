import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { highlightTerms, searchTerms } from "./searchHighlight"

function renderHighlighted(text: string, query: string) {
  return render(<div data-testid="out">{highlightTerms(text, query)}</div>)
}

function marks() {
  return Array.from(
    screen.getByTestId("out").querySelectorAll("mark")
  ) as HTMLElement[]
}

describe("searchTerms", () => {
  it("splits on whitespace and drops blanks", () => {
    expect(searchTerms("  rails   routing ")).toEqual(["rails", "routing"])
  })

  it("trims punctuation off each end", () => {
    expect(searchTerms('"rails", (routing).')).toEqual(["rails", "routing"])
  })

  it("drops single characters, which would match nearly every snippet", () => {
    expect(searchTerms("a rails")).toEqual(["rails"])
  })

  it("keeps accented words whole", () => {
    expect(searchTerms("café")).toEqual(["café"])
  })

  it("collapses repeats so a term is not marked twice over", () => {
    expect(searchTerms("rails rails")).toEqual(["rails"])
  })
})

describe("highlightTerms", () => {
  it("marks the matched term and leaves the rest as text", () => {
    renderHighlighted("Rails 8 released", "rails")

    expect(marks()).toHaveLength(1)
    expect(marks()[0]).toHaveTextContent("Rails")
    expect(screen.getByTestId("out")).toHaveTextContent("Rails 8 released")
  })

  it("marks every term of a multi-word query", () => {
    renderHighlighted("Rails routing internals", "rails routing")

    expect(marks().map((m) => m.textContent)).toEqual(["Rails", "routing"])
  })

  it("marks every occurrence, not just the first", () => {
    renderHighlighted("Rails and more Rails", "rails")

    expect(marks()).toHaveLength(2)
  })

  it("extends the mark over the rest of the word, so a stem still shows", () => {
    renderHighlighted("She was running late", "run")

    expect(marks()[0]).toHaveTextContent("running")
  })

  it("does not mark a term that starts mid-word", () => {
    renderHighlighted("Overrun and rerun", "run")

    expect(marks()).toHaveLength(0)
  })

  it("returns the text untouched when nothing matches", () => {
    renderHighlighted("Rails 8 released", "python")

    expect(marks()).toHaveLength(0)
    expect(screen.getByTestId("out")).toHaveTextContent("Rails 8 released")
  })

  it("returns the text untouched when the query has no usable term", () => {
    renderHighlighted("Rails 8 released", "  a  ")

    expect(marks()).toHaveLength(0)
  })

  it("treats regex metacharacters in the query as literal text", () => {
    renderHighlighted("Pick a.b over anything", "a.b")

    // Without escaping, `a.b` would match "any" in "anything" as well.
    expect(marks()).toHaveLength(1)
    expect(marks()[0]).toHaveTextContent("a.b")
  })

  it("does not blow up on an unbalanced bracket in the query", () => {
    expect(() => renderHighlighted("Rails 8 released", "rails[")).not.toThrow()
  })

  it("renders markup in the query as visible text rather than elements", () => {
    const { container } = renderHighlighted(
      "An <img> tag walks into a bar",
      "<img src=x onerror=alert(1)>"
    )

    expect(container.querySelector("img")).toBeNull()
    expect(screen.getByTestId("out")).toHaveTextContent(
      "An <img> tag walks into a bar"
    )
  })

  it("renders markup in the text as visible text rather than elements", () => {
    const { container } = renderHighlighted(
      "...rails <script>alert(1)</script>...",
      "rails"
    )

    expect(container.querySelector("script")).toBeNull()
    expect(screen.getByTestId("out")).toHaveTextContent("<script>alert(1)</script>")
  })
})
