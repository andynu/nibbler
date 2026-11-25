import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { SearchBar } from "./SearchBar"
import type { SaveSearchAsTagTarget } from "./SaveSearchAsTag"

const mockPreview = vi.fn()
const mockCreate = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    tagRules: {
      preview: (...args: unknown[]) => mockPreview(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}))

const savedRule = {
  id: 9,
  tag_id: 4,
  tag_name: "ruby",
  query: "ruby gems",
  feed_id: 7,
  category_id: null,
  scope_name: "Ruby Weekly",
  match_count: 0,
}

function renderBar(target: Partial<SaveSearchAsTagTarget> = {}, value = "ruby gems") {
  const onSaved = vi.fn()
  render(
    <SearchBar
      value={value}
      onChange={vi.fn()}
      saveAsTag={{
        scope: { feed_id: 7 },
        scopeName: "Ruby Weekly",
        note: null,
        tagNames: ["Ruby", "Security"],
        onSaved,
        ...target,
      }}
    />
  )
  return { onSaved }
}

describe("Save as auto-tag", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPreview.mockResolvedValue({ match_count: 12 })
    mockCreate.mockResolvedValue(savedRule)
  })

  it("is offered only once the box holds a query", () => {
    renderBar({}, "   ")

    expect(screen.queryByRole("button", { name: "Save as auto-tag…" })).not.toBeInTheDocument()
  })

  it("shows how many articles match in the search's scope before saving", async () => {
    const user = userEvent.setup()
    renderBar()

    await user.click(screen.getByRole("button", { name: "Save as auto-tag…" }))

    const dialog = await screen.findByRole("dialog", { name: "Save search as auto-tag" })
    expect(dialog).toHaveTextContent("ruby gems")
    expect(dialog).toHaveTextContent("in Ruby Weekly")
    expect(await screen.findByRole("status")).toHaveTextContent("12 articles match now.")
    expect(mockPreview).toHaveBeenCalledWith("ruby gems", { feed_id: 7, category_id: undefined })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("saves to an existing tag with the scope carried, matching the name in any case", async () => {
    const user = userEvent.setup()
    const { onSaved } = renderBar()

    await user.click(screen.getByRole("button", { name: "Save as auto-tag…" }))
    await user.type(await screen.findByLabelText("Tag"), "ruby")
    expect(screen.getByText("Adds this search to Ruby.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Save auto-tag" }))

    expect(mockCreate).toHaveBeenCalledWith({
      tag_rule: { query: "ruby gems", feed_id: 7, tag_name: "Ruby" },
    })
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(savedRule))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("creates a new tag from a typed name, scoped to a category", async () => {
    const user = userEvent.setup()
    renderBar({ scope: { category_id: 3 }, scopeName: "Programming" })

    await user.click(screen.getByRole("button", { name: "Save as auto-tag…" }))
    await user.type(await screen.findByLabelText("Tag"), "  Gems ")
    expect(screen.getByText("Creates the tag Gems.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Save auto-tag" }))

    expect(mockCreate).toHaveBeenCalledWith({
      tag_rule: { query: "ruby gems", category_id: 3, tag_name: "Gems" },
    })
  })

  it("says when the rule covers more than the search showed", async () => {
    const user = userEvent.setup()
    renderBar({
      scope: {},
      scopeName: "All feeds",
      note: "Auto-tags can't be limited to #ruby, so this one covers all feeds.",
    })

    await user.click(screen.getByRole("button", { name: "Save as auto-tag…" }))

    expect(
      await screen.findByText("Auto-tags can't be limited to #ruby, so this one covers all feeds.")
    ).toBeInTheDocument()
    expect(mockPreview).toHaveBeenCalledWith("ruby gems", { feed_id: undefined, category_id: undefined })
  })

  it("needs a tag before it saves", async () => {
    const user = userEvent.setup()
    renderBar()

    await user.click(screen.getByRole("button", { name: "Save as auto-tag…" }))
    await screen.findByText("12 articles match now.")

    expect(screen.getByRole("button", { name: "Save auto-tag" })).toBeDisabled()
  })

  it("shows the server's reason when the query cannot be a rule", async () => {
    mockPreview.mockRejectedValue(new Error('Query needs a word to match. "-term" on its own only says what to leave out.'))
    const user = userEvent.setup()
    renderBar({}, "-ruby")

    await user.click(screen.getByRole("button", { name: "Save as auto-tag…" }))
    await user.type(await screen.findByLabelText("Tag"), "Ruby")

    expect(await screen.findByText(/Query needs a word to match/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save auto-tag" })).toBeDisabled()
  })

  it("keeps the dialog open and says why when saving fails", async () => {
    mockCreate.mockRejectedValue(new Error("Query has already been taken"))
    const user = userEvent.setup()
    renderBar()

    await user.click(screen.getByRole("button", { name: "Save as auto-tag…" }))
    await user.type(await screen.findByLabelText("Tag"), "Ruby")
    await user.click(screen.getByRole("button", { name: "Save auto-tag" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Query has already been taken")
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })
})
