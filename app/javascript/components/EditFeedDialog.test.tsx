import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { EditFeedDialog } from "./EditFeedDialog"
import { mockFeed, mockCategory, mockPreferences } from "../../../test/fixtures/data"

// Mock API
const mockApiUpdate = vi.fn()
const mockApiRefresh = vi.fn()
const mockApiDelete = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    feeds: {
      update: (...args: unknown[]) => mockApiUpdate(...args),
      refresh: (...args: unknown[]) => mockApiRefresh(...args),
      delete: (...args: unknown[]) => mockApiDelete(...args),
    },
  },
}))

// Mock PreferencesContext
vi.mock("@/contexts/PreferencesContext", () => ({
  usePreferences: () => ({
    preferences: mockPreferences(),
    isLoading: false,
  }),
}))

describe("EditFeedDialog", () => {
  const defaultFeed = mockFeed({ id: 1, title: "Test Feed", feed_url: "https://example.com/feed.xml" })
  const defaultProps = {
    feed: defaultFeed,
    open: true,
    onOpenChange: vi.fn(),
    categories: [],
    onFeedUpdated: vi.fn(),
    onFeedDeleted: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiUpdate.mockResolvedValue(defaultFeed)
    mockApiRefresh.mockResolvedValue({ feed: defaultFeed, status: "success", new_entries: 0 })
    mockApiDelete.mockResolvedValue({})
  })

  describe("rendering", () => {
    it("shows dialog when open is true", () => {
      render(<EditFeedDialog {...defaultProps} open={true} />)

      expect(screen.getByText("Edit Feed")).toBeInTheDocument()
    })

    it("does not show dialog when open is false", () => {
      render(<EditFeedDialog {...defaultProps} open={false} />)

      expect(screen.queryByText("Edit Feed")).not.toBeInTheDocument()
    })

    it("returns null when feed is null", () => {
      const { container } = render(<EditFeedDialog {...defaultProps} feed={null} />)

      expect(container).toBeEmptyDOMElement()
    })

    it("shows dialog description", () => {
      render(<EditFeedDialog {...defaultProps} />)

      expect(
        screen.getByText(/update feed settings or manage subscription/i)
      ).toBeInTheDocument()
    })

    it("shows Title input field", () => {
      render(<EditFeedDialog {...defaultProps} />)

      expect(screen.getByLabelText("Title")).toBeInTheDocument()
    })

    it("shows Feed URL input field (disabled)", () => {
      render(<EditFeedDialog {...defaultProps} />)

      const urlInput = screen.getByLabelText("Feed URL")
      expect(urlInput).toBeInTheDocument()
      expect(urlInput).toBeDisabled()
    })

    it("shows Category selector", () => {
      render(<EditFeedDialog {...defaultProps} />)

      expect(screen.getByText("Category")).toBeInTheDocument()
    })

    it("shows Update interval selector", () => {
      render(<EditFeedDialog {...defaultProps} />)

      expect(screen.getByText("Update interval")).toBeInTheDocument()
    })

    it("shows Save Changes button", () => {
      render(<EditFeedDialog {...defaultProps} />)

      expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument()
    })

    it("shows Refresh button", () => {
      render(<EditFeedDialog {...defaultProps} />)

      expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument()
    })

    it("shows Unsubscribe button", () => {
      render(<EditFeedDialog {...defaultProps} />)

      expect(screen.getByRole("button", { name: /unsubscribe/i })).toBeInTheDocument()
    })
  })

  describe("form population", () => {
    it("populates title from feed", () => {
      render(<EditFeedDialog {...defaultProps} />)

      const titleInput = screen.getByLabelText("Title")
      expect(titleInput).toHaveValue("Test Feed")
    })

    it("populates URL from feed", () => {
      render(<EditFeedDialog {...defaultProps} />)

      const urlInput = screen.getByLabelText("Feed URL")
      expect(urlInput).toHaveValue("https://example.com/feed.xml")
    })

    it("shows last updated date", () => {
      const feedWithDate = mockFeed({
        last_updated: "2025-01-15T10:00:00Z",
      })

      render(<EditFeedDialog {...defaultProps} feed={feedWithDate} />)

      expect(screen.getByText(/last updated:/i)).toBeInTheDocument()
    })

    it("shows last error when present", () => {
      const feedWithError = mockFeed({
        last_error: "Connection timed out",
      })

      render(<EditFeedDialog {...defaultProps} feed={feedWithError} />)

      expect(screen.getByText("Last Error")).toBeInTheDocument()
      expect(screen.getByText("Connection timed out")).toBeInTheDocument()
    })
  })

  describe("editing", () => {
    it("can edit feed title", async () => {
      const user = userEvent.setup()

      render(<EditFeedDialog {...defaultProps} />)

      const titleInput = screen.getByLabelText("Title")
      await user.clear(titleInput)
      await user.type(titleInput, "New Title")

      expect(titleInput).toHaveValue("New Title")
    })

    it("URL field is readonly/disabled", () => {
      render(<EditFeedDialog {...defaultProps} />)

      const urlInput = screen.getByLabelText("Feed URL")
      expect(urlInput).toBeDisabled()
    })
  })

  describe("saving", () => {
    it("calls api.feeds.update with changes", async () => {
      const user = userEvent.setup()

      render(<EditFeedDialog {...defaultProps} />)

      const titleInput = screen.getByLabelText("Title")
      await user.clear(titleInput)
      await user.type(titleInput, "Updated Title")
      await user.click(screen.getByRole("button", { name: /save changes/i }))

      await waitFor(() => {
        expect(mockApiUpdate).toHaveBeenCalledWith(1, {
          feed: {
            title: "Updated Title",
            category_id: null,
            update_interval: 0,
          },
        })
      })
    })

    it("calls onFeedUpdated on success", async () => {
      const user = userEvent.setup()
      const onFeedUpdated = vi.fn()
      const updatedFeed = mockFeed({ id: 1, title: "Updated Feed" })
      mockApiUpdate.mockResolvedValue(updatedFeed)

      render(<EditFeedDialog {...defaultProps} onFeedUpdated={onFeedUpdated} />)

      await user.click(screen.getByRole("button", { name: /save changes/i }))

      await waitFor(() => {
        expect(onFeedUpdated).toHaveBeenCalledWith(updatedFeed)
      })
    })

    it("closes dialog on success", async () => {
      const user = userEvent.setup()
      const onOpenChange = vi.fn()

      render(<EditFeedDialog {...defaultProps} onOpenChange={onOpenChange} />)

      await user.click(screen.getByRole("button", { name: /save changes/i }))

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false)
      })
    })

    it("shows error message on failure", async () => {
      const user = userEvent.setup()
      mockApiUpdate.mockRejectedValue(new Error("Failed to update feed"))

      render(<EditFeedDialog {...defaultProps} />)

      await user.click(screen.getByRole("button", { name: /save changes/i }))

      await waitFor(() => {
        expect(screen.getByText("Failed to update feed")).toBeInTheDocument()
      })
    })

    it("Save button is disabled when title is empty", async () => {
      const user = userEvent.setup()

      render(<EditFeedDialog {...defaultProps} />)

      const titleInput = screen.getByLabelText("Title")
      await user.clear(titleInput)

      expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled()
    })
  })

  describe("refresh", () => {
    it("clicking Refresh calls api.feeds.refresh", async () => {
      const user = userEvent.setup()

      render(<EditFeedDialog {...defaultProps} />)

      await user.click(screen.getByRole("button", { name: /refresh/i }))

      await waitFor(() => {
        expect(mockApiRefresh).toHaveBeenCalledWith(1)
      })
    })

    it("calls onFeedUpdated after refresh", async () => {
      const user = userEvent.setup()
      const onFeedUpdated = vi.fn()
      const refreshedFeed = mockFeed({ id: 1, unread_count: 10 })
      mockApiRefresh.mockResolvedValue({ feed: refreshedFeed, status: "success", new_entries: 5 })

      render(<EditFeedDialog {...defaultProps} onFeedUpdated={onFeedUpdated} />)

      await user.click(screen.getByRole("button", { name: /refresh/i }))

      await waitFor(() => {
        expect(onFeedUpdated).toHaveBeenCalledWith(refreshedFeed)
      })
    })

    it("shows error message on refresh failure", async () => {
      const user = userEvent.setup()
      mockApiRefresh.mockRejectedValue(new Error("Network error"))

      render(<EditFeedDialog {...defaultProps} />)

      await user.click(screen.getByRole("button", { name: /refresh/i }))

      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument()
      })
    })
  })

  describe("deletion", () => {
    it("clicking Unsubscribe shows confirm button", async () => {
      const user = userEvent.setup()

      render(<EditFeedDialog {...defaultProps} />)

      await user.click(screen.getByRole("button", { name: /unsubscribe/i }))

      expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument()
    })

    it("clicking Cancel hides confirm button", async () => {
      const user = userEvent.setup()

      render(<EditFeedDialog {...defaultProps} />)

      await user.click(screen.getByRole("button", { name: /unsubscribe/i }))
      await user.click(screen.getByRole("button", { name: /cancel/i }))

      expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument()
      expect(screen.getByRole("button", { name: /unsubscribe/i })).toBeInTheDocument()
    })

    it("confirming deletion calls api.feeds.delete", async () => {
      const user = userEvent.setup()

      render(<EditFeedDialog {...defaultProps} />)

      await user.click(screen.getByRole("button", { name: /unsubscribe/i }))
      await user.click(screen.getByRole("button", { name: /confirm/i }))

      await waitFor(() => {
        expect(mockApiDelete).toHaveBeenCalledWith(1)
      })
    })

    it("calls onFeedDeleted on success", async () => {
      const user = userEvent.setup()
      const onFeedDeleted = vi.fn()

      render(<EditFeedDialog {...defaultProps} onFeedDeleted={onFeedDeleted} />)

      await user.click(screen.getByRole("button", { name: /unsubscribe/i }))
      await user.click(screen.getByRole("button", { name: /confirm/i }))

      await waitFor(() => {
        expect(onFeedDeleted).toHaveBeenCalledWith(1)
      })
    })

    it("closes dialog after deletion", async () => {
      const user = userEvent.setup()
      const onOpenChange = vi.fn()

      render(<EditFeedDialog {...defaultProps} onOpenChange={onOpenChange} />)

      await user.click(screen.getByRole("button", { name: /unsubscribe/i }))
      await user.click(screen.getByRole("button", { name: /confirm/i }))

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false)
      })
    })

    it("shows error message on deletion failure", async () => {
      const user = userEvent.setup()
      mockApiDelete.mockRejectedValue(new Error("Cannot delete feed"))

      render(<EditFeedDialog {...defaultProps} />)

      await user.click(screen.getByRole("button", { name: /unsubscribe/i }))
      await user.click(screen.getByRole("button", { name: /confirm/i }))

      await waitFor(() => {
        expect(screen.getByText("Cannot delete feed")).toBeInTheDocument()
      })
    })
  })

  describe("category handling", () => {
    it("shows category comboboxes", () => {
      const categories = [mockCategory({ id: 1, title: "Tech" })]

      render(<EditFeedDialog {...defaultProps} categories={categories} />)

      // Two comboboxes: Category and Update interval
      const comboboxes = screen.getAllByRole("combobox")
      expect(comboboxes.length).toBe(2)
    })
  })
})
