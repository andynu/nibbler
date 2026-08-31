import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { FullArticleNotice } from "./FullArticleNotice"
import type { FullArticleState } from "@/hooks/useFullArticle"

const LINK = "https://example.com/story"

function show(state: FullArticleState, overrides: { message?: string | null; onFetch?: () => void } = {}) {
  const onFetch = overrides.onFetch ?? vi.fn()
  render(
    <FullArticleNotice
      state={state}
      message={overrides.message ?? null}
      link={LINK}
      onFetch={onFetch}
    />
  )
  return onFetch
}

describe("FullArticleNotice", () => {
  it("offers to go and get the article when nothing has been asked for", () => {
    show("idle")

    expect(screen.getByRole("button", { name: /get the full article/i })).toBeInTheDocument()
    expect(screen.getByText(/this feed publishes an excerpt/i)).toBeInTheDocument()
  })

  it("asks for the article when pressed", async () => {
    const user = userEvent.setup()
    const onFetch = show("idle")

    await user.click(screen.getByRole("button", { name: /get the full article/i }))

    expect(onFetch).toHaveBeenCalledTimes(1)
  })

  it("refuses a second press while the fetch is out", () => {
    show("fetching")

    expect(screen.getByRole("button", { name: /fetching the full article/i })).toBeDisabled()
  })

  // So a reader knows the paragraphs above are no longer what the feed sent.
  it("says the body is the publisher's copy once it has one", () => {
    show("ready")

    expect(screen.getByText(/publisher's copy of the article/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /get the full article/i })).not.toBeInTheDocument()
  })

  // One sentence and no cause. Pressing again would only repeat it, because the
  // server has recorded the failure and will not ask the publisher again yet.
  it("shows the server's one message when the fetch did not work", () => {
    show("unavailable", { message: "The full article could not be retrieved." })

    expect(screen.getByText("The full article could not be retrieved.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /get the full article/i })).not.toBeInTheDocument()
  })

  it("offers the original everywhere the article is not shown", () => {
    show("unavailable", { message: "The full article could not be retrieved." })

    const link = screen.getByRole("link", { name: /read it on the publisher's site/i })
    expect(link).toHaveAttribute("href", LINK)
  })

  it("announces the outcome to a screen reader", () => {
    show("unavailable", { message: "The full article could not be retrieved." })

    expect(screen.getByRole("status")).toHaveTextContent("The full article was not retrieved.")
  })
})
