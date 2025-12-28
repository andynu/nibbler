import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { SubscribeFeedDialog } from "./SubscribeFeedDialog"
import { mockCategory, mockFeed } from "../../../test/fixtures/data"

// Mock API
const mockApiCreate = vi.fn()
const mockApiPreview = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    feeds: {
      create: (...args: unknown[]) => mockApiCreate(...args),
      preview: (...args: unknown[]) => mockApiPreview(...args),
    },
  },
}))

describe("SubscribeFeedDialog", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    categories: [],
    onFeedCreated: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiCreate.mockResolvedValue(mockFeed())
  })

  describe("rendering", () => {
    it("shows dialog when open is true", () => {
      render(<SubscribeFeedDialog {...defaultProps} open={true} />)

      expect(screen.getByText("Subscribe to Feed")).toBeInTheDocument()
    })

    it("does not show dialog when open is false", () => {
      render(<SubscribeFeedDialog {...defaultProps} open={false} />)

      expect(screen.queryByText("Subscribe to Feed")).not.toBeInTheDocument()
    })

    it("shows dialog description", () => {
      render(<SubscribeFeedDialog {...defaultProps} />)

      expect(
        screen.getByText(/enter a feed url to subscribe/i)
      ).toBeInTheDocument()
    })

    it("shows Feed URL input field", () => {
      render(<SubscribeFeedDialog {...defaultProps} />)

      expect(screen.getByLabelText("Feed URL")).toBeInTheDocument()
    })

    it("shows Title input field", () => {
      render(<SubscribeFeedDialog {...defaultProps} />)

      expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
    })

    it("shows Category selector", () => {
      render(<SubscribeFeedDialog {...defaultProps} />)

      expect(screen.getByText("Category")).toBeInTheDocument()
    })

    it("shows Subscribe button", () => {
      render(<SubscribeFeedDialog {...defaultProps} />)

      expect(screen.getByRole("button", { name: /subscribe/i })).toBeInTheDocument()
    })

    it("shows Cancel button", () => {
      render(<SubscribeFeedDialog {...defaultProps} />)

      expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument()
    })
  })

  describe("form behavior", () => {
    it("URL input is required", () => {
      render(<SubscribeFeedDialog {...defaultProps} />)

      const urlInput = screen.getByLabelText("Feed URL")
      expect(urlInput).toBeRequired()
    })

    it("Subscribe button is disabled when URL is empty", () => {
      render(<SubscribeFeedDialog {...defaultProps} />)

      const subscribeButton = screen.getByRole("button", { name: /subscribe/i })
      expect(subscribeButton).toBeDisabled()
    })

    it("Subscribe button is enabled when URL is entered", async () => {
      const user = userEvent.setup()

      render(<SubscribeFeedDialog {...defaultProps} />)

      const urlInput = screen.getByLabelText("Feed URL")
      await user.type(urlInput, "https://example.com/feed.xml")

      const subscribeButton = screen.getByRole("button", { name: /subscribe/i })
      expect(subscribeButton).not.toBeDisabled()
    })

    it("can enter feed URL", async () => {
      const user = userEvent.setup()

      render(<SubscribeFeedDialog {...defaultProps} />)

      const urlInput = screen.getByLabelText("Feed URL")
      await user.type(urlInput, "https://example.com/rss")

      expect(urlInput).toHaveValue("https://example.com/rss")
    })

    it("can enter optional title", async () => {
      const user = userEvent.setup()

      render(<SubscribeFeedDialog {...defaultProps} />)

      const titleInput = screen.getByLabelText(/title/i)
      await user.type(titleInput, "My Custom Title")

      expect(titleInput).toHaveValue("My Custom Title")
    })

    it("populates URL from initialUrl prop", () => {
      render(
        <SubscribeFeedDialog
          {...defaultProps}
          initialUrl="https://prefilled.com/feed"
        />
      )

      const urlInput = screen.getByLabelText("Feed URL")
      expect(urlInput).toHaveValue("https://prefilled.com/feed")
    })
  })

  describe("category selection", () => {
    it("shows category selector combobox", () => {
      const categories = [
        mockCategory({ id: 1, title: "Tech" }),
        mockCategory({ id: 2, title: "News" }),
      ]

      render(<SubscribeFeedDialog {...defaultProps} categories={categories} />)

      expect(screen.getByRole("combobox")).toBeInTheDocument()
    })
  })

  describe("submission", () => {
    it("calls api.feeds.create with URL", async () => {
      const user = userEvent.setup()

      render(<SubscribeFeedDialog {...defaultProps} />)

      await user.type(
        screen.getByLabelText("Feed URL"),
        "https://example.com/feed.xml"
      )
      await user.click(screen.getByRole("button", { name: /subscribe/i }))

      await waitFor(() => {
        expect(mockApiCreate).toHaveBeenCalledWith({
          feed: {
            feed_url: "https://example.com/feed.xml",
            title: undefined,
            category_id: undefined,
          },
        })
      })
    })

    it("includes title when provided", async () => {
      const user = userEvent.setup()

      render(<SubscribeFeedDialog {...defaultProps} />)

      await user.type(screen.getByLabelText("Feed URL"), "https://example.com/feed.xml")
      await user.type(screen.getByLabelText(/title/i), "My Feed")
      await user.click(screen.getByRole("button", { name: /subscribe/i }))

      await waitFor(() => {
        expect(mockApiCreate).toHaveBeenCalledWith({
          feed: {
            feed_url: "https://example.com/feed.xml",
            title: "My Feed",
            category_id: undefined,
          },
        })
      })
    })


    it("calls onFeedCreated on success", async () => {
      const user = userEvent.setup()
      const onFeedCreated = vi.fn()
      const createdFeed = mockFeed({ id: 42, title: "New Feed" })
      mockApiCreate.mockResolvedValue(createdFeed)

      render(
        <SubscribeFeedDialog {...defaultProps} onFeedCreated={onFeedCreated} />
      )

      await user.type(
        screen.getByLabelText("Feed URL"),
        "https://example.com/feed.xml"
      )
      await user.click(screen.getByRole("button", { name: /subscribe/i }))

      await waitFor(() => {
        expect(onFeedCreated).toHaveBeenCalledWith(createdFeed)
      })
    })

    it("closes dialog on success", async () => {
      const user = userEvent.setup()
      const onOpenChange = vi.fn()

      render(
        <SubscribeFeedDialog {...defaultProps} onOpenChange={onOpenChange} />
      )

      await user.type(
        screen.getByLabelText("Feed URL"),
        "https://example.com/feed.xml"
      )
      await user.click(screen.getByRole("button", { name: /subscribe/i }))

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false)
      })
    })

    it("shows error message on failure", async () => {
      const user = userEvent.setup()
      mockApiCreate.mockRejectedValue(new Error("Failed to fetch feed"))

      render(<SubscribeFeedDialog {...defaultProps} />)

      await user.type(
        screen.getByLabelText("Feed URL"),
        "https://example.com/feed.xml"
      )
      await user.click(screen.getByRole("button", { name: /subscribe/i }))

      await waitFor(() => {
        expect(screen.getByText("Failed to fetch feed")).toBeInTheDocument()
      })
    })

    it("shows generic error message when error has no message", async () => {
      const user = userEvent.setup()
      mockApiCreate.mockRejectedValue("some error")

      render(<SubscribeFeedDialog {...defaultProps} />)

      await user.type(
        screen.getByLabelText("Feed URL"),
        "https://example.com/feed.xml"
      )
      await user.click(screen.getByRole("button", { name: /subscribe/i }))

      await waitFor(() => {
        expect(screen.getByText("Failed to subscribe to feed")).toBeInTheDocument()
      })
    })

    it("shows loading state during submission", async () => {
      const user = userEvent.setup()
      // Make the API call hang
      mockApiCreate.mockImplementation(
        () => new Promise(() => {})
      )

      render(<SubscribeFeedDialog {...defaultProps} />)

      await user.type(
        screen.getByLabelText("Feed URL"),
        "https://example.com/feed.xml"
      )
      await user.click(screen.getByRole("button", { name: /subscribe/i }))

      // Button should show loading spinner and be disabled
      const button = screen.getByRole("button", { name: /subscribe/i })
      expect(button).toBeDisabled()
    })
  })

  describe("test/preview functionality", () => {
    it("shows Test button", () => {
      render(<SubscribeFeedDialog {...defaultProps} />)

      expect(screen.getByRole("button", { name: /test/i })).toBeInTheDocument()
    })

    it("Test button is disabled when URL is empty", () => {
      render(<SubscribeFeedDialog {...defaultProps} />)

      const testButton = screen.getByRole("button", { name: /test/i })
      expect(testButton).toBeDisabled()
    })

    it("Test button is enabled when URL is entered", async () => {
      const user = userEvent.setup()

      render(<SubscribeFeedDialog {...defaultProps} />)

      await user.type(screen.getByLabelText("Feed URL"), "https://example.com/feed.xml")

      const testButton = screen.getByRole("button", { name: /test/i })
      expect(testButton).not.toBeDisabled()
    })

    it("clicking Test calls api.feeds.preview with URL", async () => {
      const user = userEvent.setup()
      mockApiPreview.mockResolvedValue({
        title: "Test Feed",
        feed_url: "https://example.com/feed.xml",
        entry_count: 10,
        last_updated: "2025-12-27T12:00:00Z",
        sample_entries: [],
      })

      render(<SubscribeFeedDialog {...defaultProps} />)

      await user.type(screen.getByLabelText("Feed URL"), "https://example.com/feed.xml")
      await user.click(screen.getByRole("button", { name: /test/i }))

      await waitFor(() => {
        expect(mockApiPreview).toHaveBeenCalledWith("https://example.com/feed.xml")
      })
    })

    it("shows preview information after successful test", async () => {
      const user = userEvent.setup()
      mockApiPreview.mockResolvedValue({
        title: "Tech Blog",
        feed_url: "https://example.com/feed.xml",
        entry_count: 25,
        last_updated: "2025-12-27T12:00:00Z",
        sample_entries: [
          { title: "First Article", published: "2025-12-27" },
          { title: "Second Article", published: "2025-12-26" },
        ],
      })

      render(<SubscribeFeedDialog {...defaultProps} />)

      await user.type(screen.getByLabelText("Feed URL"), "https://example.com/feed.xml")
      await user.click(screen.getByRole("button", { name: /test/i }))

      await waitFor(() => {
        expect(screen.getByText("Feed found")).toBeInTheDocument()
        expect(screen.getByText("Tech Blog")).toBeInTheDocument()
        expect(screen.getByText("25 articles")).toBeInTheDocument()
        expect(screen.getByText("First Article")).toBeInTheDocument()
      })
    })

    it("auto-fills title from preview", async () => {
      const user = userEvent.setup()
      mockApiPreview.mockResolvedValue({
        title: "Auto-Detected Title",
        feed_url: "https://example.com/feed.xml",
        entry_count: 5,
        last_updated: null,
        sample_entries: [],
      })

      render(<SubscribeFeedDialog {...defaultProps} />)

      await user.type(screen.getByLabelText("Feed URL"), "https://example.com/feed.xml")
      await user.click(screen.getByRole("button", { name: /test/i }))

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toHaveValue("Auto-Detected Title")
      })
    })

    it("shows error when test fails", async () => {
      const user = userEvent.setup()
      mockApiPreview.mockRejectedValue(new Error("Unable to fetch feed"))

      render(<SubscribeFeedDialog {...defaultProps} />)

      await user.type(screen.getByLabelText("Feed URL"), "https://example.com/invalid")
      await user.click(screen.getByRole("button", { name: /test/i }))

      await waitFor(() => {
        expect(screen.getByText("Unable to fetch feed")).toBeInTheDocument()
      })
    })

    it("clears preview when URL changes", async () => {
      const user = userEvent.setup()
      mockApiPreview.mockResolvedValue({
        title: "Test Feed",
        feed_url: "https://example.com/feed.xml",
        entry_count: 10,
        last_updated: null,
        sample_entries: [],
      })

      render(<SubscribeFeedDialog {...defaultProps} />)

      // Test first URL
      await user.type(screen.getByLabelText("Feed URL"), "https://example.com/feed.xml")
      await user.click(screen.getByRole("button", { name: /test/i }))

      await waitFor(() => {
        expect(screen.getByText("Feed found")).toBeInTheDocument()
      })

      // Change URL - preview should clear
      await user.type(screen.getByLabelText("Feed URL"), "2")

      expect(screen.queryByText("Feed found")).not.toBeInTheDocument()
    })
  })

  describe("cancel behavior", () => {
    it("clicking Cancel closes dialog", async () => {
      const user = userEvent.setup()
      const onOpenChange = vi.fn()

      render(
        <SubscribeFeedDialog {...defaultProps} onOpenChange={onOpenChange} />
      )

      await user.click(screen.getByRole("button", { name: /cancel/i }))

      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it("clears form when closing", async () => {
      const user = userEvent.setup()

      const { rerender } = render(<SubscribeFeedDialog {...defaultProps} />)

      // Fill in form
      await user.type(
        screen.getByLabelText("Feed URL"),
        "https://example.com/feed.xml"
      )
      await user.type(screen.getByLabelText(/title/i), "My Title")

      // Close dialog
      await user.click(screen.getByRole("button", { name: /cancel/i }))

      // Reopen dialog
      rerender(<SubscribeFeedDialog {...defaultProps} open={true} />)

      // Form should be cleared
      expect(screen.getByLabelText("Feed URL")).toHaveValue("")
      expect(screen.getByLabelText(/title/i)).toHaveValue("")
    })
  })
})
