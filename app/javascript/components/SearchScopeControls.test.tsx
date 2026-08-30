import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { SearchScopeControls } from "./SearchScopeControls"

function props(overrides = {}) {
  return {
    place: "list" as const,
    history: "list" as const,
    onPlaceChange: vi.fn(),
    onHistoryChange: vi.fn(),
    placeLabel: "Ruby Weekly",
    historyLabel: "Unread",
    ...overrides,
  }
}

describe("SearchScopeControls", () => {
  it("names the scope the results came from", () => {
    render(<SearchScopeControls {...props()} />)

    const group = screen.getByRole("group", { name: "Search scope" })
    expect(group).toHaveTextContent("Ruby Weekly")
    expect(group).toHaveTextContent("Unread")
  })

  it("renders nothing when the list narrows neither axis", () => {
    const { container } = render(
      <SearchScopeControls {...props({ placeLabel: null, historyLabel: null })} />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it("offers no place pill for a list that narrows nothing by place", () => {
    render(<SearchScopeControls {...props({ placeLabel: null })} />)

    expect(screen.queryByRole("button", { name: "Ruby Weekly" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Unread" })).toBeInTheDocument()
  })

  it("offers no history pill for a list with no read-state window", () => {
    render(<SearchScopeControls {...props({ historyLabel: null })} />)

    expect(screen.queryByRole("button", { name: "Unread" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Ruby Weekly" })).toBeInTheDocument()
  })

  describe("place", () => {
    it("widens to all feeds when the pill naming the list is pressed", async () => {
      const user = userEvent.setup()
      const onPlaceChange = vi.fn()
      render(<SearchScopeControls {...props({ onPlaceChange })} />)

      await user.click(screen.getByRole("button", { name: "Ruby Weekly" }))

      expect(onPlaceChange).toHaveBeenCalledWith("everything")
    })

    it("says All feeds once widened, and narrows again from there", async () => {
      const user = userEvent.setup()
      const onPlaceChange = vi.fn()
      render(<SearchScopeControls {...props({ place: "everything", onPlaceChange })} />)

      expect(screen.queryByRole("button", { name: "Ruby Weekly" })).not.toBeInTheDocument()
      await user.click(screen.getByRole("button", { name: "All feeds" }))

      expect(onPlaceChange).toHaveBeenCalledWith("list")
    })
  })

  describe("history", () => {
    it("widens to all history when the pill naming the window is pressed", async () => {
      const user = userEvent.setup()
      const onHistoryChange = vi.fn()
      render(<SearchScopeControls {...props({ onHistoryChange })} />)

      await user.click(screen.getByRole("button", { name: "Unread" }))

      expect(onHistoryChange).toHaveBeenCalledWith("all")
    })

    it("says All history once widened, and narrows again from there", async () => {
      const user = userEvent.setup()
      const onHistoryChange = vi.fn()
      render(<SearchScopeControls {...props({ history: "all", onHistoryChange })} />)

      expect(screen.queryByRole("button", { name: "Unread" })).not.toBeInTheDocument()
      await user.click(screen.getByRole("button", { name: "All history" }))

      expect(onHistoryChange).toHaveBeenCalledWith("list")
    })
  })

  it("keeps both axes independent", async () => {
    const user = userEvent.setup()
    const onPlaceChange = vi.fn()
    const onHistoryChange = vi.fn()
    render(
      <SearchScopeControls
        {...props({ place: "everything", onPlaceChange, onHistoryChange })}
      />
    )

    await user.click(screen.getByRole("button", { name: "Unread" }))

    expect(onHistoryChange).toHaveBeenCalledWith("all")
    expect(onPlaceChange).not.toHaveBeenCalled()
  })

  it("is reachable by keyboard from the box it sits under", async () => {
    const user = userEvent.setup()
    const onPlaceChange = vi.fn()
    render(<SearchScopeControls {...props({ onPlaceChange })} />)

    await user.tab()
    expect(screen.getByRole("button", { name: "Ruby Weekly" })).toHaveFocus()

    await user.keyboard("{Enter}")
    expect(onPlaceChange).toHaveBeenCalledWith("everything")
  })
})
