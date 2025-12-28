import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { MoveFeedDialog } from "./MoveFeedDialog"
import { Feed, Category } from "@/lib/api"

// Mock the API
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual("@/lib/api")
  return {
    ...actual,
    api: {
      feeds: {
        update: vi.fn(),
      },
      categories: {
        create: vi.fn(),
      },
    },
  }
})

import { api } from "@/lib/api"

describe("MoveFeedDialog", () => {
  const mockFeed: Feed = {
    id: 1,
    title: "Test Feed",
    feed_url: "https://example.com/feed.xml",
    site_url: "https://example.com",
    category_id: null,
    category_title: null,
    icon_url: null,
    last_updated: null,
    last_successful_update: null,
    last_error: null,
    unread_count: 5,
    entry_count: 100,
    oldest_entry_date: null,
    newest_entry_date: null,
  }

  const mockCategories: Category[] = [
    {
      id: 1,
      title: "Tech",
      parent_id: null,
      collapsed: false,
      order_id: 0,
      feed_count: 3,
      unread_count: 10,
    },
    {
      id: 2,
      title: "News",
      parent_id: null,
      collapsed: false,
      order_id: 1,
      feed_count: 5,
      unread_count: 20,
    },
    {
      id: 3,
      title: "Programming",
      parent_id: 1,
      collapsed: false,
      order_id: 0,
      feed_count: 2,
      unread_count: 5,
    },
  ]

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    feed: mockFeed,
    categories: mockCategories,
    onFeedMoved: vi.fn(),
    onCategoryCreated: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders when open with feed", () => {
    render(<MoveFeedDialog {...defaultProps} />)

    expect(screen.getByPlaceholderText(/search categories/i)).toBeInTheDocument()
  })

  it("does not render when feed is null", () => {
    render(<MoveFeedDialog {...defaultProps} feed={null} />)

    expect(screen.queryByPlaceholderText(/search categories/i)).not.toBeInTheDocument()
  })

  it("shows all categories", () => {
    render(<MoveFeedDialog {...defaultProps} />)

    expect(screen.getByText("Tech")).toBeInTheDocument()
    expect(screen.getByText("News")).toBeInTheDocument()
    expect(screen.getByText("Programming")).toBeInTheDocument()
  })

  it("shows uncategorized option", () => {
    render(<MoveFeedDialog {...defaultProps} />)

    expect(screen.getByText(/remove from category/i)).toBeInTheDocument()
  })

  it("filters categories when searching", async () => {
    const user = userEvent.setup()
    render(<MoveFeedDialog {...defaultProps} />)

    await user.type(screen.getByPlaceholderText(/search categories/i), "tech")

    // Tech and Programming (child of Tech) should be visible
    expect(screen.getByText("Tech")).toBeInTheDocument()
    expect(screen.getByText("Programming")).toBeInTheDocument()
    // News should not match
    expect(screen.queryByText("News")).not.toBeInTheDocument()
  })

  it("moves feed to selected category", async () => {
    const user = userEvent.setup()
    const updatedFeed = { ...mockFeed, category_id: 1 }
    vi.mocked(api.feeds.update).mockResolvedValue(updatedFeed)

    render(<MoveFeedDialog {...defaultProps} />)

    await user.click(screen.getByText("Tech"))

    await waitFor(() => {
      expect(api.feeds.update).toHaveBeenCalledWith(1, {
        feed: { category_id: 1 },
      })
    })

    expect(defaultProps.onFeedMoved).toHaveBeenCalledWith(updatedFeed)
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false)
  })

  it("shows current category with check mark when feed has category", () => {
    const feedWithCategory = { ...mockFeed, category_id: 1 }
    render(<MoveFeedDialog {...defaultProps} feed={feedWithCategory} />)

    // Should show current location section
    expect(screen.getByText("Current Location")).toBeInTheDocument()
  })

  it("shows create category option when searching for non-existent category", async () => {
    const user = userEvent.setup()
    render(<MoveFeedDialog {...defaultProps} />)

    await user.type(screen.getByPlaceholderText(/search categories/i), "NewCategory")

    expect(screen.getByText(/create "newcategory"/i)).toBeInTheDocument()
  })
})
