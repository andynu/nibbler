import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { LabelManager } from "./LabelManager"
import { mockTag } from "../../../test/fixtures/data"

// Mock API
const mockApiTagsList = vi.fn()
const mockApiTagsCreate = vi.fn()
const mockApiTagsUpdate = vi.fn()
const mockApiTagsDelete = vi.fn()
const mockApiTagRulesList = vi.fn()
const mockApiTagRulesDelete = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    tags: {
      list: () => mockApiTagsList(),
      create: (...args: unknown[]) => mockApiTagsCreate(...args),
      update: (...args: unknown[]) => mockApiTagsUpdate(...args),
      delete: (...args: unknown[]) => mockApiTagsDelete(...args),
    },
    tagRules: {
      list: (...args: unknown[]) => mockApiTagRulesList(...args),
      delete: (...args: unknown[]) => mockApiTagRulesDelete(...args),
    },
  },
}))

describe("LabelManager", () => {
  const testTag = mockTag({
    id: 1,
    name: "Important",
    fg_color: "#ffffff",
    bg_color: "#ef4444",
    entry_count: 42,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiTagsList.mockResolvedValue([])
    mockApiTagsCreate.mockResolvedValue(testTag)
    mockApiTagsUpdate.mockResolvedValue(testTag)
    mockApiTagsDelete.mockResolvedValue({})
    mockApiTagRulesList.mockResolvedValue([])
    mockApiTagRulesDelete.mockResolvedValue({})

    // Mock window.confirm
    vi.spyOn(window, "confirm").mockReturnValue(true)
    vi.spyOn(window, "alert").mockImplementation(() => {})
  })

  describe("loading state", () => {
    it("shows loading message initially", () => {
      mockApiTagsList.mockReturnValue(new Promise(() => {}))

      render(<LabelManager />)

      expect(screen.getByText("Loading tags...")).toBeInTheDocument()
    })
  })

  describe("empty state", () => {
    it("shows empty message when no tags", async () => {
      mockApiTagsList.mockResolvedValue([])

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByText("No tags yet.")).toBeInTheDocument()
      })
    })

    it("shows help text in empty state", async () => {
      mockApiTagsList.mockResolvedValue([])

      render(<LabelManager />)

      await waitFor(() => {
        expect(
          screen.getByText(/create tags to organize and classify articles/i)
        ).toBeInTheDocument()
      })
    })
  })

  describe("tag list rendering", () => {
    it("shows header", async () => {
      mockApiTagsList.mockResolvedValue([])
      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByText("Tags")).toBeInTheDocument()
      })
    })

    it("shows New Tag button", async () => {
      mockApiTagsList.mockResolvedValue([])
      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /new tag/i })).toBeInTheDocument()
      })
    })

    it("renders tag name", async () => {
      mockApiTagsList.mockResolvedValue([testTag])

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByText("Important")).toBeInTheDocument()
      })
    })

    it("shows entry count", async () => {
      mockApiTagsList.mockResolvedValue([testTag])

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByText("42 articles")).toBeInTheDocument()
      })
    })

    it("shows singular article count", async () => {
      const singleTag = { ...testTag, entry_count: 1 }
      mockApiTagsList.mockResolvedValue([singleTag])

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByText("1 article")).toBeInTheDocument()
      })
    })

    it("renders tag with correct colors", async () => {
      mockApiTagsList.mockResolvedValue([testTag])

      render(<LabelManager />)

      await waitFor(() => {
        const badge = screen.getByText("Important").closest('[data-slot="badge"]')
        expect(badge).toHaveStyle({
          backgroundColor: "#ef4444",
          color: "#ffffff",
        })
      })
    })

    it("shows edit button for each tag", async () => {
      mockApiTagsList.mockResolvedValue([testTag])

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /edit important/i })).toBeInTheDocument()
      })
    })

    it("shows delete button for each tag", async () => {
      mockApiTagsList.mockResolvedValue([testTag])

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /delete important/i })).toBeInTheDocument()
      })
    })

    it("shows zero articles count", async () => {
      const emptyTag = { ...testTag, entry_count: 0 }
      mockApiTagsList.mockResolvedValue([emptyTag])

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByText("0 articles")).toBeInTheDocument()
      })
    })

    it("renders multiple tags", async () => {
      const tags = [
        testTag,
        mockTag({ id: 2, name: "Read Later", entry_count: 10 }),
        mockTag({ id: 3, name: "Archive", entry_count: 5 }),
      ]
      mockApiTagsList.mockResolvedValue(tags)

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByText("Important")).toBeInTheDocument()
        expect(screen.getByText("Read Later")).toBeInTheDocument()
        expect(screen.getByText("Archive")).toBeInTheDocument()
      })
    })
  })

  describe("delete tag", () => {
    it("shows confirmation message with entry count", async () => {
      const user = userEvent.setup()
      mockApiTagsList.mockResolvedValue([testTag])

      render(<LabelManager />)

      const deleteButton = await screen.findByRole("button", { name: /delete important/i })
      await user.click(deleteButton)

      expect(window.confirm).toHaveBeenCalledWith(
        'Delete "Important"? It is currently applied to 42 article(s).'
      )
    })

    it("shows simple confirmation when no entries", async () => {
      const user = userEvent.setup()
      const emptyTag = { ...testTag, entry_count: 0 }
      mockApiTagsList.mockResolvedValue([emptyTag])

      render(<LabelManager />)

      const deleteButton = await screen.findByRole("button", { name: /delete important/i })
      await user.click(deleteButton)

      expect(window.confirm).toHaveBeenCalledWith('Delete "Important"?')
    })

    it("calls delete API when confirmed", async () => {
      const user = userEvent.setup()
      mockApiTagsList.mockResolvedValue([testTag])

      render(<LabelManager />)

      const deleteButton = await screen.findByRole("button", { name: /delete important/i })
      await user.click(deleteButton)

      expect(mockApiTagsDelete).toHaveBeenCalledWith(1)
    })

    it("does not call delete when cancelled", async () => {
      const user = userEvent.setup()
      vi.mocked(window.confirm).mockReturnValue(false)
      mockApiTagsList.mockResolvedValue([testTag])

      render(<LabelManager />)

      const deleteButton = await screen.findByRole("button", { name: /delete important/i })
      await user.click(deleteButton)

      expect(mockApiTagsDelete).not.toHaveBeenCalled()
    })

    it("removes tag from list after deletion", async () => {
      const user = userEvent.setup()
      mockApiTagsList.mockResolvedValue([testTag])

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByText("Important")).toBeInTheDocument()
      })

      const deleteButton = screen.getByRole("button", { name: /delete important/i })
      await user.click(deleteButton)

      await waitFor(() => {
        expect(screen.queryByText("Important")).not.toBeInTheDocument()
      })
    })
  })

  describe("New Tag button", () => {
    it("clicking New Tag opens create tag dialog", async () => {
      const user = userEvent.setup()
      mockApiTagsList.mockResolvedValue([])

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /new tag/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /new tag/i }))

      // Create Tag dialog should open
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /create tag/i })).toBeInTheDocument()
      })
    })
  })

  describe("edit tag button", () => {
    it("clicking edit button sets editing state", async () => {
      const user = userEvent.setup()
      mockApiTagsList.mockResolvedValue([testTag])

      render(<LabelManager />)

      const editButton = await screen.findByRole("button", { name: /edit important/i })
      await user.click(editButton)

      // Edit dialog should open
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /edit tag/i })).toBeInTheDocument()
      })
    })
  })

  describe("morning paper settings", () => {
    it("hides the per-day limit until the switch is on", async () => {
      const user = userEvent.setup()
      mockApiTagsList.mockResolvedValue([testTag])

      render(<LabelManager />)

      await user.click(await screen.findByRole("button", { name: /edit important/i }))

      const toggle = await screen.findByRole("switch", { name: /include in morning paper/i })
      expect(toggle).toHaveAttribute("aria-checked", "false")
      expect(screen.queryByRole("spinbutton", { name: /per day/i })).not.toBeInTheDocument()

      await user.click(toggle)

      expect(toggle).toHaveAttribute("aria-checked", "true")
      expect(screen.getByRole("spinbutton", { name: /per day/i })).toHaveValue(5)
    })

    it("saves the switch and limit and shows the returned values on reopen", async () => {
      const user = userEvent.setup()
      mockApiTagsList.mockResolvedValue([testTag])
      mockApiTagsUpdate.mockResolvedValue({ ...testTag, include_in_paper: true, paper_limit: 3 })

      render(<LabelManager />)

      await user.click(await screen.findByRole("button", { name: /edit important/i }))
      await user.click(await screen.findByRole("switch", { name: /include in morning paper/i }))
      const limit = screen.getByRole("spinbutton", { name: /per day/i })
      await user.clear(limit)
      await user.type(limit, "3")
      await user.click(screen.getByRole("button", { name: /save changes/i }))

      await waitFor(() => {
        expect(mockApiTagsUpdate).toHaveBeenCalledWith(1, {
          tag: expect.objectContaining({ include_in_paper: true, paper_limit: 3 }),
        })
      })
      await waitFor(() => {
        expect(screen.queryByRole("heading", { name: /edit tag/i })).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /edit important/i }))

      expect(
        await screen.findByRole("switch", { name: /include in morning paper/i })
      ).toHaveAttribute("aria-checked", "true")
      expect(screen.getByRole("spinbutton", { name: /per day/i })).toHaveValue(3)
    })

    it("does not save a per-day limit below one", async () => {
      const user = userEvent.setup()
      mockApiTagsList.mockResolvedValue([{ ...testTag, include_in_paper: true }])

      render(<LabelManager />)

      await user.click(await screen.findByRole("button", { name: /edit important/i }))
      const limit = await screen.findByRole("spinbutton", { name: /per day/i })
      await user.clear(limit)
      await user.type(limit, "0")
      await user.click(screen.getByRole("button", { name: /save changes/i }))

      expect(window.alert).toHaveBeenCalledWith("Per day must be a whole number of 1 or more")
      expect(mockApiTagsUpdate).not.toHaveBeenCalled()
    })
  })

  describe("auto-tag rules", () => {
    const rules = [
      { id: 1, tag_id: 1, tag_name: "Important", query: "ruby gems", feed_id: 7, category_id: null, scope_name: "Ruby Weekly", match_count: 12 },
      { id: 2, tag_id: 1, tag_name: "Important", query: "rails", feed_id: null, category_id: null, scope_name: "All feeds", match_count: 1 },
    ]

    async function openEditor() {
      const user = userEvent.setup()
      mockApiTagsList.mockResolvedValue([testTag])
      render(<LabelManager />)
      await user.click(await screen.findByRole("button", { name: /edit important/i }))
      return user
    }

    it("lists the tag's rules with query, scope and match count", async () => {
      mockApiTagRulesList.mockResolvedValue(rules)
      await openEditor()

      const list = await screen.findByRole("list", { name: "Auto-tag rules" })
      const items = within(list).getAllByRole("listitem")
      expect(mockApiTagRulesList).toHaveBeenCalledWith(1)
      expect(items[0]).toHaveTextContent("ruby gems in Ruby Weekly12 articles")
      expect(items[1]).toHaveTextContent("rails in All feeds1 article")
    })

    it("says how to add a rule when the tag has none", async () => {
      await openEditor()

      expect(
        await screen.findByText("No rules yet. To add one, search for articles and choose Save as auto-tag.")
      ).toBeInTheDocument()
    })

    it("is not shown while creating a tag", async () => {
      const user = userEvent.setup()
      render(<LabelManager />)
      await user.click(await screen.findByRole("button", { name: /new tag/i }))

      await screen.findByRole("heading", { name: /create tag/i })
      expect(screen.queryByRole("heading", { name: "Auto-tag rules" })).not.toBeInTheDocument()
      expect(mockApiTagRulesList).not.toHaveBeenCalled()
    })

    it("deletes a rule after confirming", async () => {
      mockApiTagRulesList.mockResolvedValue(rules)
      const user = await openEditor()

      await user.click(await screen.findByRole("button", { name: "Delete rule ruby gems in Ruby Weekly" }))

      expect(window.confirm).toHaveBeenCalledWith(
        'Delete the auto-tag rule "ruby gems" in Ruby Weekly? Articles it tagged lose the tag, unless you tagged them yourself or another rule matches.'
      )
      expect(mockApiTagRulesDelete).toHaveBeenCalledWith(1)
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Delete rule ruby gems in Ruby Weekly" })).not.toBeInTheDocument()
      )
      expect(screen.getByRole("button", { name: "Delete rule rails in All feeds" })).toBeInTheDocument()
    })

    it("keeps the rule when the confirmation is cancelled", async () => {
      mockApiTagRulesList.mockResolvedValue(rules)
      vi.mocked(window.confirm).mockReturnValue(false)
      const user = await openEditor()

      await user.click(await screen.findByRole("button", { name: "Delete rule ruby gems in Ruby Weekly" }))

      expect(mockApiTagRulesDelete).not.toHaveBeenCalled()
      expect(screen.getByRole("button", { name: "Delete rule ruby gems in Ruby Weekly" })).toBeInTheDocument()
    })
  })
})
