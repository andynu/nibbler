import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { SearchResultList } from "./SearchResultList"
import { mockSearchResult } from "../../../test/fixtures/data"

describe("SearchResultList", () => {
  const defaultProps = {
    results: [],
    query: "rails",
    isSearching: false,
    error: null,
    selectedEntryId: null,
    onSelectResult: vi.fn(),
    formatDate: () => "5m ago",
  }

  it("lists one option per hit", () => {
    render(
      <SearchResultList
        {...defaultProps}
        results={[
          mockSearchResult({ id: 1, title: "Rails 8 released" }),
          mockSearchResult({ id: 2, title: "Rails routing" }),
        ]}
      />
    )

    expect(screen.getAllByRole("option")).toHaveLength(2)
    // By role, not by text: the query terms are marked, so the title is split
    // across a <mark> and its siblings and getByText no longer sees it whole.
    expect(screen.getByRole("option", { name: /rails 8 released/i })).toBeInTheDocument()
  })

  it("shows the feed and published date alongside the title", () => {
    render(
      <SearchResultList
        {...defaultProps}
        results={[mockSearchResult({ feed_title: "Ruby Weekly" })]}
      />
    )

    expect(screen.getByText("Ruby Weekly")).toBeInTheDocument()
    expect(screen.getByText("5m ago")).toBeInTheDocument()
  })

  it("opens the entry behind a hit when it is clicked", async () => {
    const user = userEvent.setup()
    const onSelectResult = vi.fn()
    render(
      <SearchResultList
        {...defaultProps}
        results={[mockSearchResult({ id: 42, title: "Rails 8 released" })]}
        onSelectResult={onSelectResult}
      />
    )

    await user.click(screen.getByRole("option"))

    expect(onSelectResult).toHaveBeenCalledWith(42)
  })

  it("marks the currently open entry as selected", () => {
    render(
      <SearchResultList
        {...defaultProps}
        results={[mockSearchResult({ id: 1 }), mockSearchResult({ id: 2 })]}
        selectedEntryId={2}
      />
    )

    const options = screen.getAllByRole("option")
    expect(options[0]).toHaveAttribute("aria-selected", "false")
    expect(options[1]).toHaveAttribute("aria-selected", "true")
  })

  it("shows a searching state while the first response is outstanding", () => {
    render(<SearchResultList {...defaultProps} isSearching={true} />)

    expect(screen.getByRole("status", { name: "Searching" })).toBeInTheDocument()
  })

  it("keeps the previous hits on screen while the next query is in flight", () => {
    render(
      <SearchResultList
        {...defaultProps}
        isSearching={true}
        results={[mockSearchResult({ title: "Rails 8 released" })]}
      />
    )

    expect(screen.getByRole("option", { name: /rails 8 released/i })).toBeInTheDocument()
    expect(screen.queryByRole("status", { name: "Searching" })).not.toBeInTheDocument()
  })

  it("names the query when nothing matched", () => {
    render(<SearchResultList {...defaultProps} query="zzzz" />)

    expect(screen.getByText(/no matches for "zzzz" in all articles/i)).toBeInTheDocument()
  })

  it("names the scope that produced an empty result set", () => {
    render(
      <SearchResultList {...defaultProps} query="zzzz" scopeLabel="Ruby Weekly" />
    )

    expect(
      screen.getByText(/no matches for "zzzz" in ruby weekly/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/go to all feeds to search everything/i)).toBeInTheDocument()
  })

  it("does not offer to widen a search that was never narrowed", () => {
    render(<SearchResultList {...defaultProps} query="zzzz" />)

    expect(screen.queryByText(/go to all feeds/i)).not.toBeInTheDocument()
  })

  it("reports a failed search instead of an empty result set", () => {
    render(<SearchResultList {...defaultProps} error="HTTP 500" />)

    expect(screen.getByText(/search failed: http 500/i)).toBeInTheDocument()
    expect(screen.queryByText(/no matches/i)).not.toBeInTheDocument()
  })

  it("shows the match snippet under the title", () => {
    render(
      <SearchResultList
        {...defaultProps}
        results={[
          mockSearchResult({
            title: "Rails 8 released",
            snippet: "...the rails team shipped it on Tuesday...",
          }),
        ]}
      />
    )

    expect(
      screen.getByRole("option", { name: /the rails team shipped it on tuesday/i })
    ).toBeInTheDocument()
  })

  it("leaves the row alone when the server returned no snippet", () => {
    const { container } = render(
      <SearchResultList
        {...defaultProps}
        results={[mockSearchResult({ title: "Rails 8 released", snippet: "" })]}
      />
    )

    expect(container.querySelector("[role=option]")).toHaveTextContent(
      /^Rails 8 released/
    )
  })

  it("marks the query terms in the title and the snippet", () => {
    const { container } = render(
      <SearchResultList
        {...defaultProps}
        query="rails"
        results={[
          mockSearchResult({
            title: "Rails 8 released",
            snippet: "...the rails team shipped it...",
          }),
        ]}
      />
    )

    const marked = Array.from(container.querySelectorAll("mark"))
    expect(marked.map((m) => m.textContent)).toEqual(["Rails", "rails"])
  })

  it("renders markup from the query and the snippet as text, never as elements", () => {
    const { container } = render(
      <SearchResultList
        {...defaultProps}
        query="<img src=x onerror=alert(1)>"
        results={[
          mockSearchResult({
            title: "Tag soup",
            snippet: "...<script>alert(1)</script>...",
          }),
        ]}
      />
    )

    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("script")).toBeNull()
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument()
  })

  it("marks starred hits", () => {
    render(
      <SearchResultList
        {...defaultProps}
        results={[mockSearchResult({ id: 1, starred: true }), mockSearchResult({ id: 2 })]}
      />
    )

    expect(screen.getAllByLabelText("Starred")).toHaveLength(1)
  })
})
