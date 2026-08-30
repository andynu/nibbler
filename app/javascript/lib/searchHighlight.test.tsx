import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { highlightHeadline, highlightTerms, searchTerms } from "./searchHighlight"

/** Entry::HEADLINE_START / Entry::HEADLINE_STOP, as the server sends them. */
const START = String.fromCharCode(2)
const STOP = String.fromCharCode(3)

function renderHighlighted(text: string, query: string) {
  return render(<div data-testid="out">{highlightTerms(text, query)}</div>)
}

function renderHeadline(headline: string) {
  return render(<div data-testid="out">{highlightHeadline(headline)}</div>)
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

  // The query is websearch_to_tsquery syntax, so two of its tokens are not
  // words the reader is looking for and must not be marked as though they were.
  it("drops an excluded term, which no result can contain", () => {
    expect(searchTerms("rails -turbo")).toEqual(["rails"])
  })

  it("drops the or operator rather than marking words that start with it", () => {
    expect(searchTerms("rails or hanami")).toEqual(["rails", "hanami"])
    expect(searchTerms("rails OR hanami")).toEqual(["rails", "hanami"])
  })

  it("keeps a hyphen that is part of a word", () => {
    expect(searchTerms("well-known")).toEqual(["well-known"])
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

describe("highlightHeadline", () => {
  it("marks the run the server delimited and leaves the rest as text", () => {
    renderHeadline(`The ${START}study${STOP} of quokkas concluded.`)

    expect(marks()).toHaveLength(1)
    expect(marks()[0]).toHaveTextContent("study")
    expect(screen.getByTestId("out")).toHaveTextContent(
      "The study of quokkas concluded."
    )
  })

  it("marks a stem the query never contained literally", () => {
    // ts_headline matched "studies" -> "studi" -> "study". No substring pass
    // over this snippet could have found the query in it.
    renderHeadline(`A ${START}study${STOP} of quokkas`)

    expect(marks()[0]).toHaveTextContent("study")
  })

  it("marks every delimited run", () => {
    renderHeadline(`${START}Rails${STOP} and more ${START}rails${STOP}`)

    expect(marks().map((m) => m.textContent)).toEqual(["Rails", "rails"])
  })

  it("keeps the delimiters out of the rendered text", () => {
    renderHeadline(`The ${START}study${STOP} of quokkas`)

    expect(screen.getByTestId("out").textContent).toBe("The study of quokkas")
  })

  it("returns the snippet untouched when the server marked nothing", () => {
    renderHeadline("The study of quokkas concluded.")

    expect(marks()).toHaveLength(0)
    expect(screen.getByTestId("out")).toHaveTextContent(
      "The study of quokkas concluded."
    )
  })

  it("returns an empty snippet untouched", () => {
    renderHeadline("")

    expect(screen.getByTestId("out").textContent).toBe("")
  })

  it("does not mark to the end of the snippet on an unclosed delimiter", () => {
    renderHeadline(`before${START}after`)

    expect(marks()).toHaveLength(0)
    expect(screen.getByTestId("out")).toHaveTextContent("beforeafter")
  })

  it("renders markup in the snippet as visible text rather than elements", () => {
    // The snippet is server-supplied article text. It is a string, not HTML:
    // nothing here goes through dangerouslySetInnerHTML, so a script tag that
    // survived into the excerpt is characters on the page, not an element.
    const { container } = renderHeadline(
      `...${START}rails${STOP} <script>alert(1)</script>...`
    )

    expect(container.querySelector("script")).toBeNull()
    expect(screen.getByTestId("out")).toHaveTextContent("<script>alert(1)</script>")
  })

  it("renders markup inside a marked run as visible text too", () => {
    const { container } = renderHeadline(
      `${START}<img src=x onerror=alert(1)>${STOP} follows`
    )

    expect(container.querySelector("img")).toBeNull()
    expect(marks()[0]).toHaveTextContent("<img src=x onerror=alert(1)>")
  })
})
