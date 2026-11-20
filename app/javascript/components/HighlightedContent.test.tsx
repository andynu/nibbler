import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { HighlightedContent } from "./HighlightedContent"
import type { WordTimestamp } from "@/lib/api"

const html = '<p>One two</p><img src="https://example.com/a.png" alt="Pic"><p>three</p>'

const timestamps: WordTimestamp[] = [
  { word: "One", start: 0, end: 0.4 },
  { word: "two", start: 0.4, end: 0.8 },
  { word: "three", start: 0.8, end: 1.2 },
]

describe("HighlightedContent", () => {
  // Each word advance is a re-render with the same html and timestamps. React
  // 19 rewrites innerHTML whenever the dangerouslySetInnerHTML object changes
  // identity, which would recreate the images and drop the active-word class.
  it("keeps images and moves the highlight when the current word advances", () => {
    const { rerender, container } = render(
      <HighlightedContent html={html} timestamps={timestamps} currentWordIndex={0} isPlaying />
    )
    const img = screen.getByRole("img", { name: "Pic" })

    rerender(
      <HighlightedContent html={html} timestamps={timestamps} currentWordIndex={1} isPlaying />
    )

    expect(img.isConnected).toBe(true)
    expect(screen.getByRole("img", { name: "Pic" })).toBe(img)
    const active = container.querySelectorAll(".tts-word-active")
    expect(active).toHaveLength(1)
    expect(active[0]).toHaveTextContent("two")
  })

  it("keeps the highlight through a re-render that does not change the word", () => {
    const { rerender, container } = render(
      <HighlightedContent html={html} timestamps={timestamps} currentWordIndex={2} isPlaying />
    )
    const img = screen.getByRole("img", { name: "Pic" })

    rerender(
      <HighlightedContent
        html={html}
        timestamps={timestamps}
        currentWordIndex={2}
        isPlaying
        className="prose"
      />
    )

    expect(img.isConnected).toBe(true)
    expect(container.querySelector(".tts-word-active")).toHaveTextContent("three")
  })

  it("replaces the body when the html changes", () => {
    const { rerender } = render(
      <HighlightedContent html={html} timestamps={timestamps} currentWordIndex={0} isPlaying />
    )
    const img = screen.getByRole("img", { name: "Pic" })

    rerender(
      <HighlightedContent
        html='<p>One two three</p><img src="https://example.com/b.png" alt="Other">'
        timestamps={timestamps}
        currentWordIndex={0}
        isPlaying
      />
    )

    expect(img.isConnected).toBe(false)
    expect(screen.getByRole("img", { name: "Other" })).toBeInTheDocument()
  })
})
