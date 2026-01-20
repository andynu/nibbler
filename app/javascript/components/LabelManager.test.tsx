import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { LabelManager } from "./LabelManager"
import { mockTag } from "../../../test/fixtures/data"

// Mock API
const mockApiTagsList = vi.fn()
const mockApiTagsCreate = vi.fn()
const mockApiTagsUpdate = vi.fn()
const mockApiTagsDelete = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    tags: {
      list: () => mockApiTagsList(),
      create: (...args: unknown[]) => mockApiTagsCreate(...args),
      update: (...args: unknown[]) => mockApiTagsUpdate(...args),
      delete: (...args: unknown[]) => mockApiTagsDelete(...args),
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
})
