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
    expect(screen.getByText("Rails 8 released")).toBeInTheDocument()
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

    expect(screen.getByText("Rails 8 released")).toBeInTheDocument()
    expect(screen.queryByRole("status", { name: "Searching" })).not.toBeInTheDocument()
  })

  it("names the query when nothing matched", () => {
    render(<SearchResultList {...defaultProps} query="zzzz" />)

    expect(screen.getByText(/no matches for "zzzz"/i)).toBeInTheDocument()
  })

  it("reports a failed search instead of an empty result set", () => {
    render(<SearchResultList {...defaultProps} error="HTTP 500" />)

    expect(screen.getByText(/search failed: http 500/i)).toBeInTheDocument()
    expect(screen.queryByText(/no matches/i)).not.toBeInTheDocument()
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
