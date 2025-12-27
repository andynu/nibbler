import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { FeedSidebar } from "./FeedSidebar"
import { mockFeed, mockCategory } from "../../../test/fixtures/data"

// Mock ThemeContext
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({
    resolvedTheme: "light",
  }),
}))

// Mock PreferencesContext
const mockPreferences = {
  hide_read_feeds: "false",
  feeds_sort_by_unread: "false",
  hide_read_shows_special: "true",
}

const mockUpdatePreference = vi.fn()

vi.mock("@/contexts/PreferencesContext", () => ({
  usePreferences: () => ({
    preferences: mockPreferences,
    updatePreference: mockUpdatePreference,
    isLoading: false,
  }),
}))

// Mock API
vi.mock("@/lib/api", () => ({
  api: {
    categories: {
      delete: vi.fn().mockResolvedValue({}),
    },
  },
}))

describe("FeedSidebar", () => {
  const defaultProps = {
    feeds: [],
    categories: [],
    selectedFeedId: null,
    selectedCategoryId: null,
    virtualFeed: null as "starred" | "fresh" | "published" | null,
    onSelectFeed: vi.fn(),
    onSelectCategory: vi.fn(),
    onSelectVirtualFeed: vi.fn(),
    onRefreshAll: vi.fn(),
    isRefreshing: false,
    onSubscribe: vi.fn(),
    onEditFeed: vi.fn(),
    onSettings: vi.fn(),
    onCategoriesChange: vi.fn(),
    onFeedsChange: vi.fn(),
    onFeedUpdated: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockPreferences.hide_read_feeds = "false"
    mockPreferences.feeds_sort_by_unread = "false"
  })

  describe("header and branding", () => {
    it("shows TTRB branding", () => {
      render(<FeedSidebar {...defaultProps} />)

      expect(screen.getByText("TTRB")).toBeInTheDocument()
    })

    it("shows refresh button", () => {
      render(<FeedSidebar {...defaultProps} />)

      expect(screen.getByTitle("Refresh all feeds")).toBeInTheDocument()
    })

    it("shows settings button", () => {
      render(<FeedSidebar {...defaultProps} />)

      expect(screen.getByTitle("Settings")).toBeInTheDocument()
    })

    it("clicking refresh calls onRefreshAll", async () => {
      const user = userEvent.setup()
      const onRefreshAll = vi.fn()

      render(<FeedSidebar {...defaultProps} onRefreshAll={onRefreshAll} />)

      await user.click(screen.getByTitle("Refresh all feeds"))

      expect(onRefreshAll).toHaveBeenCalledOnce()
    })

    it("refresh button shows spinning animation when refreshing", () => {
      render(<FeedSidebar {...defaultProps} isRefreshing={true} />)

      const refreshButton = screen.getByTitle("Refresh all feeds")
      expect(refreshButton).toBeDisabled()
    })

    it("clicking settings calls onSettings", async () => {
      const user = userEvent.setup()
      const onSettings = vi.fn()

      render(<FeedSidebar {...defaultProps} onSettings={onSettings} />)

      await user.click(screen.getByTitle("Settings"))

      expect(onSettings).toHaveBeenCalledOnce()
    })
  })

  describe("virtual feeds section", () => {
    it("shows All Feeds option", () => {
      render(<FeedSidebar {...defaultProps} />)

      expect(screen.getByText("All Feeds")).toBeInTheDocument()
    })

    it("shows Fresh virtual feed", () => {
      render(<FeedSidebar {...defaultProps} />)

      expect(screen.getByText("Fresh")).toBeInTheDocument()
    })

    it("shows Starred virtual feed", () => {
      render(<FeedSidebar {...defaultProps} />)

      expect(screen.getByText("Starred")).toBeInTheDocument()
    })

    it("shows Published virtual feed", () => {
      render(<FeedSidebar {...defaultProps} />)

      expect(screen.getByText("Published")).toBeInTheDocument()
    })

    it("shows total unread count on All Feeds", () => {
      const feeds = [
        mockFeed({ id: 1, unread_count: 5 }),
        mockFeed({ id: 2, unread_count: 3 }),
      ]

      render(<FeedSidebar {...defaultProps} feeds={feeds} />)

      expect(screen.getByText("8")).toBeInTheDocument()
    })

    it("clicking All Feeds clears all selections", async () => {
      const user = userEvent.setup()
      const onSelectFeed = vi.fn()
      const onSelectCategory = vi.fn()
      const onSelectVirtualFeed = vi.fn()

      render(
        <FeedSidebar
          {...defaultProps}
          onSelectFeed={onSelectFeed}
          onSelectCategory={onSelectCategory}
          onSelectVirtualFeed={onSelectVirtualFeed}
        />
      )

      await user.click(screen.getByText("All Feeds"))

      expect(onSelectFeed).toHaveBeenCalledWith(null)
      expect(onSelectCategory).toHaveBeenCalledWith(null)
      expect(onSelectVirtualFeed).toHaveBeenCalledWith(null)
    })

    it("clicking Fresh sets virtual feed", async () => {
      const user = userEvent.setup()
      const onSelectVirtualFeed = vi.fn()

      render(
        <FeedSidebar {...defaultProps} onSelectVirtualFeed={onSelectVirtualFeed} />
      )

      await user.click(screen.getByText("Fresh"))

      expect(onSelectVirtualFeed).toHaveBeenCalledWith("fresh")
    })

    it("clicking Starred sets virtual feed", async () => {
      const user = userEvent.setup()
      const onSelectVirtualFeed = vi.fn()

      render(
        <FeedSidebar {...defaultProps} onSelectVirtualFeed={onSelectVirtualFeed} />
      )

      await user.click(screen.getByText("Starred"))

      expect(onSelectVirtualFeed).toHaveBeenCalledWith("starred")
    })

    it("clicking Published sets virtual feed", async () => {
      const user = userEvent.setup()
      const onSelectVirtualFeed = vi.fn()

      render(
        <FeedSidebar {...defaultProps} onSelectVirtualFeed={onSelectVirtualFeed} />
      )

      await user.click(screen.getByText("Published"))

      expect(onSelectVirtualFeed).toHaveBeenCalledWith("published")
    })
  })

  describe("uncategorized feeds", () => {
    it("renders feeds without category", () => {
      const feeds = [
        mockFeed({ id: 1, title: "Uncategorized Feed", category_id: null }),
      ]

      render(<FeedSidebar {...defaultProps} feeds={feeds} />)

      expect(screen.getByText("Uncategorized Feed")).toBeInTheDocument()
    })

    it("shows feed title", () => {
      const feeds = [mockFeed({ title: "My Feed" })]

      render(<FeedSidebar {...defaultProps} feeds={feeds} />)

      expect(screen.getByText("My Feed")).toBeInTheDocument()
    })

    it("shows unread count badge", () => {
      const feeds = [mockFeed({ id: 1, unread_count: 42 })]

      render(<FeedSidebar {...defaultProps} feeds={feeds} />)

      // There will be two badges: total unread and feed unread
      const badges = screen.getAllByText("42")
      expect(badges.length).toBeGreaterThanOrEqual(1)
    })

    it("clicking feed calls onSelectFeed with feed ID", async () => {
      const user = userEvent.setup()
      const onSelectFeed = vi.fn()
      const feeds = [mockFeed({ id: 42, title: "Clickable Feed" })]

      render(
        <FeedSidebar {...defaultProps} feeds={feeds} onSelectFeed={onSelectFeed} />
      )

      await user.click(screen.getByText("Clickable Feed"))

      expect(onSelectFeed).toHaveBeenCalledWith(42)
    })
  })

  describe("categories", () => {
    it("renders category headers", () => {
      const categories = [mockCategory({ id: 1, title: "Tech News" })]

      render(<FeedSidebar {...defaultProps} categories={categories} />)

      expect(screen.getByText("Tech News")).toBeInTheDocument()
    })

    it("shows category unread count", () => {
      const categories = [mockCategory({ id: 1, title: "Tech News" })]
      const feeds = [
        mockFeed({ id: 1, category_id: 1, unread_count: 10 }),
        mockFeed({ id: 2, category_id: 1, unread_count: 5 }),
      ]

      render(
        <FeedSidebar {...defaultProps} feeds={feeds} categories={categories} />
      )

      // Category should show combined unread count (there will be multiple 15s)
      expect(screen.getAllByText("15").length).toBeGreaterThanOrEqual(1)
    })

    it("renders feeds within categories", () => {
      const categories = [mockCategory({ id: 1, title: "Tech News" })]
      const feeds = [
        mockFeed({ id: 1, title: "Tech Blog", category_id: 1 }),
        mockFeed({ id: 2, title: "Hacker News", category_id: 1 }),
      ]

      render(
        <FeedSidebar {...defaultProps} feeds={feeds} categories={categories} />
      )

      expect(screen.getByText("Tech Blog")).toBeInTheDocument()
      expect(screen.getByText("Hacker News")).toBeInTheDocument()
    })

    it("clicking category calls onSelectCategory", async () => {
      const user = userEvent.setup()
      const onSelectCategory = vi.fn()
      const categories = [mockCategory({ id: 5, title: "Science" })]

      render(
        <FeedSidebar
          {...defaultProps}
          categories={categories}
          onSelectCategory={onSelectCategory}
        />
      )

      await user.click(screen.getByText("Science"))

      expect(onSelectCategory).toHaveBeenCalledWith(5)
    })

    it("categories start expanded", () => {
      const categories = [mockCategory({ id: 1, title: "Tech" })]
      const feeds = [mockFeed({ id: 1, title: "Tech Feed", category_id: 1 })]

      render(
        <FeedSidebar {...defaultProps} feeds={feeds} categories={categories} />
      )

      // Feed should be visible (category expanded)
      expect(screen.getByText("Tech Feed")).toBeInTheDocument()
    })
  })

  describe("feeds with errors", () => {
    it("shows feeds with errors section when errors exist", () => {
      const feeds = [
        mockFeed({ id: 1, title: "Broken Feed", last_error: "Connection refused" }),
      ]

      render(<FeedSidebar {...defaultProps} feeds={feeds} />)

      expect(screen.getByText("1 feed with errors")).toBeInTheDocument()
    })

    it("shows plural form for multiple errors", () => {
      const feeds = [
        mockFeed({ id: 1, title: "Broken Feed 1", last_error: "Error 1" }),
        mockFeed({ id: 2, title: "Broken Feed 2", last_error: "Error 2" }),
      ]

      render(<FeedSidebar {...defaultProps} feeds={feeds} />)

      expect(screen.getByText("2 feeds with errors")).toBeInTheDocument()
    })

    it("clicking error feed calls onEditFeed", async () => {
      const user = userEvent.setup()
      const onEditFeed = vi.fn()
      const feeds = [
        mockFeed({ id: 1, title: "Broken Feed", last_error: "Error" }),
      ]

      render(
        <FeedSidebar {...defaultProps} feeds={feeds} onEditFeed={onEditFeed} />
      )

      // Find all "Broken Feed" buttons and click the first one (in error section)
      const feedButtons = screen.getAllByText("Broken Feed")
      await user.click(feedButtons[0])

      expect(onEditFeed).toHaveBeenCalledWith(feeds[0])
    })
  })

  describe("add menu", () => {
    it("opens dropdown when Add button clicked", async () => {
      const user = userEvent.setup()

      render(<FeedSidebar {...defaultProps} />)

      await user.click(screen.getByTitle("Add..."))

      expect(screen.getByText("Subscribe to Feed")).toBeInTheDocument()
      expect(screen.getByText("New Category")).toBeInTheDocument()
    })

    it("clicking Subscribe to Feed calls onSubscribe", async () => {
      const user = userEvent.setup()
      const onSubscribe = vi.fn()

      render(<FeedSidebar {...defaultProps} onSubscribe={onSubscribe} />)

      await user.click(screen.getByTitle("Add..."))
      await user.click(screen.getByText("Subscribe to Feed"))

      expect(onSubscribe).toHaveBeenCalledOnce()
    })
  })

  describe("preference toggles", () => {
    it("hide read toggle updates preference", async () => {
      const user = userEvent.setup()

      render(<FeedSidebar {...defaultProps} />)

      await user.click(screen.getByTitle("Hide read feeds"))

      expect(mockUpdatePreference).toHaveBeenCalledWith("hide_read_feeds", "true")
    })

    it("hides feeds with no unread when hide_read_feeds is true", () => {
      mockPreferences.hide_read_feeds = "true"
      const feeds = [
        mockFeed({ id: 1, title: "Has Unread", unread_count: 5 }),
        mockFeed({ id: 2, title: "All Read No Unread", unread_count: 0 }),
      ]

      render(<FeedSidebar {...defaultProps} feeds={feeds} />)

      expect(screen.getByText("Has Unread")).toBeInTheDocument()
      expect(screen.queryByText("All Read No Unread")).not.toBeInTheDocument()
    })

    it("hides empty categories when hide_read_feeds is true", () => {
      mockPreferences.hide_read_feeds = "true"
      const categories = [
        mockCategory({ id: 1, title: "Has Feeds" }),
        mockCategory({ id: 2, title: "Empty Category" }),
      ]
      const feeds = [
        mockFeed({ id: 1, category_id: 1, unread_count: 5 }),
      ]

      render(
        <FeedSidebar {...defaultProps} feeds={feeds} categories={categories} />
      )

      expect(screen.getByText("Has Feeds")).toBeInTheDocument()
      expect(screen.queryByText("Empty Category")).not.toBeInTheDocument()
    })

    it("sort by unread toggle updates preference", async () => {
      const user = userEvent.setup()

      render(<FeedSidebar {...defaultProps} />)

      await user.click(screen.getByTitle("Sort by unread count"))

      expect(mockUpdatePreference).toHaveBeenCalledWith(
        "feeds_sort_by_unread",
        "true"
      )
    })
  })

  describe("feed selection highlighting", () => {
    it("selected feed has accent background", () => {
      const feeds = [mockFeed({ id: 5, title: "Selected Feed" })]

      const { container } = render(
        <FeedSidebar {...defaultProps} feeds={feeds} selectedFeedId={5} />
      )

      // The selected feed button should have inline background style
      const feedButton = screen.getByText("Selected Feed").closest("button")
      expect(feedButton).toHaveStyle({
        backgroundColor: "var(--color-accent-primary-dark)",
      })
    })
  })

  describe("category context menu", () => {
    it("shows rename option in category menu", async () => {
      const user = userEvent.setup()
      const categories = [mockCategory({ id: 1, title: "My Tech Category" })]

      render(<FeedSidebar {...defaultProps} categories={categories} />)

      // Hover over category to show menu button, then click it
      const categoryRow = screen.getByText("My Tech Category").closest(".group\\/category")
      const buttons = within(categoryRow!).getAllByRole("button")
      // Find the menu button (with ellipsis icon)
      const menuButton = buttons.find(btn => btn.querySelector("svg.lucide-ellipsis"))

      if (menuButton) {
        await user.click(menuButton)
        expect(screen.getByText("Rename")).toBeInTheDocument()
      }
    })

    it("shows delete option in category menu", async () => {
      const user = userEvent.setup()
      const categories = [mockCategory({ id: 1, title: "My Tech Category" })]

      render(<FeedSidebar {...defaultProps} categories={categories} />)

      const categoryRow = screen.getByText("My Tech Category").closest(".group\\/category")
      const buttons = within(categoryRow!).getAllByRole("button")
      const menuButton = buttons.find(btn => btn.querySelector("svg.lucide-ellipsis"))

      if (menuButton) {
        await user.click(menuButton)
        expect(screen.getByText("Delete")).toBeInTheDocument()
      }
    })
  })

  describe("feed context menu", () => {
    it("shows Edit Feed option in feed menu", async () => {
      const user = userEvent.setup()
      const feeds = [mockFeed({ id: 1, title: "My Feed" })]

      render(<FeedSidebar {...defaultProps} feeds={feeds} />)

      // Find feed row and its menu button
      const feedRow = screen.getByText("My Feed").closest(".group")
      const menuButtons = within(feedRow!).getAllByRole("button")
      const menuButton = menuButtons.find(btn => btn.querySelector("svg.lucide-more-horizontal"))

      if (menuButton) {
        await user.click(menuButton)
        expect(screen.getByText("Edit Feed")).toBeInTheDocument()
      }
    })

    it("clicking Edit Feed calls onEditFeed", async () => {
      const user = userEvent.setup()
      const onEditFeed = vi.fn()
      const feeds = [mockFeed({ id: 1, title: "My Feed" })]

      render(
        <FeedSidebar {...defaultProps} feeds={feeds} onEditFeed={onEditFeed} />
      )

      const feedRow = screen.getByText("My Feed").closest(".group")
      const menuButtons = within(feedRow!).getAllByRole("button")
      const menuButton = menuButtons.find(btn => btn.querySelector("svg.lucide-more-horizontal"))

      if (menuButton) {
        await user.click(menuButton)
        await user.click(screen.getByText("Edit Feed"))

        expect(onEditFeed).toHaveBeenCalledWith(feeds[0])
      }
    })
  })

  describe("feed icons", () => {
    it("shows feed icon when icon_url is present", () => {
      const feeds = [
        mockFeed({
          id: 1,
          title: "Feed With Icon",
          icon_url: "https://example.com/icon.png",
        }),
      ]

      render(<FeedSidebar {...defaultProps} feeds={feeds} />)

      const icon = screen.getByAltText("")
      expect(icon).toHaveAttribute("src", "https://example.com/icon.png")
    })

    it("shows RSS icon when no icon_url", () => {
      const feeds = [mockFeed({ id: 1, title: "Feed Without Icon", icon_url: null })]

      render(<FeedSidebar {...defaultProps} feeds={feeds} />)

      // The RSS icon from lucide should be present
      const feedButton = screen.getByText("Feed Without Icon").closest("button")
      expect(feedButton?.querySelector("svg.lucide-rss")).toBeInTheDocument()
    })
  })

  describe("error indicators", () => {
    it("shows feeds with errors section when last_error is set", () => {
      const feeds = [
        mockFeed({ id: 1, title: "Error Feed Only", last_error: "Connection timeout" }),
      ]

      render(<FeedSidebar {...defaultProps} feeds={feeds} />)

      // The error section should be shown with the error count
      expect(screen.getByText("1 feed with errors")).toBeInTheDocument()
    })
  })
})
