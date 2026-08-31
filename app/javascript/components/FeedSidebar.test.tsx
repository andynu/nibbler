import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { FeedSidebar } from "./FeedSidebar"
import { api } from "@/lib/api"
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
  sync_to_tree: "false",
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
    feeds: {
      refresh: vi.fn().mockResolvedValue({}),
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
    selectedTag: null,
    tagsWithCounts: [] as Array<{ name: string; count: number }>,
    onSelectFeed: vi.fn(),
    onSelectCategory: vi.fn(),
    onSelectVirtualFeed: vi.fn(),
    onSelectTag: vi.fn(),
    onRefreshAll: vi.fn(),
    isRefreshing: false,
    onSubscribe: vi.fn(),
    onEditFeed: vi.fn(),
    onSettings: vi.fn(),
    onCategoriesChange: vi.fn(),
    onFeedsChange: vi.fn(),
    onFeedUpdated: vi.fn(),
    isCollapsed: false,
    onToggleCollapse: vi.fn(),
    trackedFeedId: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockPreferences.hide_read_feeds = "false"
    mockPreferences.feeds_sort_by_unread = "false"
  })

  describe("header and branding", () => {
    it("shows NibbleRSS branding", () => {
      render(<FeedSidebar {...defaultProps} />)

      expect(screen.getByText("NibbleRSS")).toBeInTheDocument()
    })

    it("shows refresh button", () => {
      render(<FeedSidebar {...defaultProps} />)

      expect(screen.getByRole("button", { name: /refresh all feeds/i })).toBeInTheDocument()
    })

    it("shows settings button", () => {
      render(<FeedSidebar {...defaultProps} />)

      expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument()
    })

    it("clicking refresh calls onRefreshAll", async () => {
      const user = userEvent.setup()
      const onRefreshAll = vi.fn()

      render(<FeedSidebar {...defaultProps} onRefreshAll={onRefreshAll} />)

      await user.click(screen.getByRole("button", { name: /refresh all feeds/i }))

      expect(onRefreshAll).toHaveBeenCalledOnce()
    })

    it("refresh button shows spinning animation when refreshing", () => {
      render(<FeedSidebar {...defaultProps} isRefreshing={true} />)

      const refreshButton = screen.getByRole("button", { name: /refresh all feeds/i })
      expect(refreshButton).toBeDisabled()
    })

    it("clicking settings calls onSettings", async () => {
      const user = userEvent.setup()
      const onSettings = vi.fn()

      render(<FeedSidebar {...defaultProps} onSettings={onSettings} />)

      await user.click(screen.getByRole("button", { name: /settings/i }))

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

  describe("virtual feeds stay pinned above the scrolling tree", () => {
    // The counts on Fresh, Starred and Published are how you navigate, and they
    // used to be the top rows of the one long scrolling column that also holds
    // the category tree. Expanding categories pushed them off the top. They now
    // live in a region of their own, outside the scroll viewport.
    const scrollViewport = (container: HTMLElement) =>
      container.querySelector('[data-slot="scroll-area-viewport"]')

    const feeds = [
      mockFeed({ id: 1, title: "Categorized Feed", category_id: 10, unread_count: 4 }),
    ]
    const categories = [mockCategory({ id: 10, title: "News" })]

    it.each(["All Feeds", "Fresh", "Starred", "Published", "Stories"])(
      "renders %s outside the scroll viewport",
      (name) => {
        const { container } = render(
          <FeedSidebar {...defaultProps} feeds={feeds} categories={categories} />
        )

        const row = screen.getByText(name)
        expect(row).toBeInTheDocument()
        expect(scrollViewport(container)).not.toContainElement(row)
      }
    )

    it("keeps the category tree inside the scroll viewport", () => {
      const { container } = render(
        <FeedSidebar {...defaultProps} feeds={feeds} categories={categories} />
      )

      expect(scrollViewport(container)).toContainElement(screen.getByText("News"))
      expect(scrollViewport(container)).toContainElement(
        screen.getByText("Categorized Feed")
      )
    })

    it("counts still update on the pinned rows", () => {
      const { container } = render(
        <FeedSidebar
          {...defaultProps}
          feeds={feeds}
          categories={categories}
          virtualFolderCounts={{ fresh: 7, starred: 2, published: 1 }}
        />
      )

      const fresh = screen.getByRole("button", { name: /Fresh/ })
      expect(fresh).toHaveTextContent("7")
      expect(scrollViewport(container)).not.toContainElement(fresh)
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

  // The real app mounts the sidebar before the categories request returns, so
  // the categories prop is [] on the first render. These tests reproduce that
  // ordering with an empty first render followed by a rerender.
  describe("expanded category persistence", () => {
    const categories = [
      mockCategory({ id: 1, title: "Tech" }),
      mockCategory({ id: 2, title: "Science" }),
    ]
    const feeds = [
      mockFeed({ id: 1, title: "Tech Feed", category_id: 1 }),
      mockFeed({ id: 2, title: "Science Feed", category_id: 2 }),
    ]

    function renderWithLateCategories() {
      const view = render(
        <FeedSidebar {...defaultProps} feeds={feeds} categories={[]} />
      )
      view.rerender(
        <FeedSidebar {...defaultProps} feeds={feeds} categories={categories} />
      )
      return view
    }

    it("expands every category on a first visit with nothing saved", () => {
      renderWithLateCategories()

      expect(screen.getByText("Tech Feed")).toBeInTheDocument()
      expect(screen.getByText("Science Feed")).toBeInTheDocument()
    })

    it("keeps everything collapsed when an empty set was saved", () => {
      localStorage.setItem("nibbler:expandedCategories", "[]")

      renderWithLateCategories()

      expect(screen.queryByText("Tech Feed")).not.toBeInTheDocument()
      expect(screen.queryByText("Science Feed")).not.toBeInTheDocument()
    })

    it("restores a saved subset of expanded categories", () => {
      localStorage.setItem("nibbler:expandedCategories", "[1]")

      renderWithLateCategories()

      expect(screen.getByText("Tech Feed")).toBeInTheDocument()
      expect(screen.queryByText("Science Feed")).not.toBeInTheDocument()
    })

    it("writes nothing before the categories request returns", () => {
      render(<FeedSidebar {...defaultProps} feeds={feeds} categories={[]} />)

      // Persisting the empty pre-load set would read back as a deliberate
      // "collapse everything" on the next visit.
      expect(localStorage.getItem("nibbler:expandedCategories")).toBeNull()
    })

    it("persists collapsing a category once categories have loaded", async () => {
      const user = userEvent.setup()

      renderWithLateCategories()
      await user.click(screen.getByRole("button", { name: "Collapse all categories" }))

      expect(screen.queryByText("Tech Feed")).not.toBeInTheDocument()
      expect(localStorage.getItem("nibbler:expandedCategories")).toBe("[]")
    })
  })

  describe("feeds with errors", () => {
    it("shows collapsible errors folder when errors exist", () => {
      const feeds = [
        mockFeed({ id: 1, title: "Broken Feed", last_error: "Connection refused" }),
      ]

      render(<FeedSidebar {...defaultProps} feeds={feeds} />)

      expect(screen.getByText("Errors (1)")).toBeInTheDocument()
    })

    // lucide-react puts aria-hidden="true" on an icon it thinks is decorative,
    // which is any icon with no children and no a11y prop. The error indicator
    // is passed role="img" and an aria-label precisely so it does not vanish
    // from the accessibility tree. If someone drops those props this fails,
    // which is the only cheap way to notice: happy-dom has no stylesheet, so no
    // test here can say anything about the icon being visible.
    it("exposes the error indicator with an accessible name", () => {
      const feeds = [
        mockFeed({ id: 1, title: "Broken Feed", last_error: "Feed not found" }),
      ]

      render(<FeedSidebar {...defaultProps} feeds={feeds} />)

      expect(
        screen.getByRole("img", { name: "Broken Feed: update error" })
      ).toBeInTheDocument()
    })

    // A feed that failed once and a feed that has been dead for a month carry
    // the same last_error string. The streak is what tells them apart, so it
    // has to reach the accessible name and not only the hover tooltip.
    it("names how long a broken feed has been failing", () => {
      const feeds = [
        mockFeed({
          id: 1,
          title: "Dead Feed",
          last_error: "getaddrinfo: Name or service not known",
          consecutive_failures: 47,
          first_failed_at: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
          broken: true,
        }),
      ]

      render(<FeedSidebar {...defaultProps} feeds={feeds} />)

      expect(
        screen.getByRole("img", { name: "Dead Feed: Failing for 3 weeks (47 attempts)" })
      ).toBeInTheDocument()
    })

    // One miss is noise. The summary must stay out of the name until the streak
    // means something, or people learn to ignore it.
    it("does not claim a feed is failing after a single error", () => {
      const feeds = [
        mockFeed({
          id: 1,
          title: "Blipped Feed",
          last_error: "Connection timed out",
          consecutive_failures: 1,
          first_failed_at: new Date(Date.now() - 60_000).toISOString(),
          broken: false,
        }),
      ]

      render(<FeedSidebar {...defaultProps} feeds={feeds} />)

      expect(
        screen.getByRole("img", { name: "Blipped Feed: update error" })
      ).toBeInTheDocument()
    })

    it("shows count for multiple errors", () => {
      const feeds = [
        mockFeed({ id: 1, title: "Broken Feed 1", last_error: "Error 1" }),
        mockFeed({ id: 2, title: "Broken Feed 2", last_error: "Error 2" }),
      ]

      render(<FeedSidebar {...defaultProps} feeds={feeds} />)

      expect(screen.getByText("Errors (2)")).toBeInTheDocument()
    })

    it("error feeds are hidden by default (collapsed)", () => {
      const feeds = [
        mockFeed({ id: 1, title: "Broken Feed", last_error: "Error" }),
      ]

      render(<FeedSidebar {...defaultProps} feeds={feeds} />)

      // Error folder is collapsed by default, so feed name shouldn't appear in error section
      // Note: The feed may appear elsewhere if uncategorized, so we just verify the folder exists
      expect(screen.getByText("Errors (1)")).toBeInTheDocument()
    })

    it("clicking errors folder expands to show error category groups", async () => {
      const user = userEvent.setup()
      const feeds = [
        mockFeed({ id: 1, title: "Broken Feed", last_error: "Feed not found", category_id: 1 }),
      ]
      const categories = [mockCategory({ id: 1, title: "Tech" })]

      render(
        <FeedSidebar {...defaultProps} feeds={feeds} categories={categories} />
      )

      // Click the errors folder to expand
      await user.click(screen.getByText("Errors (1)"))

      // Should show error category group
      expect(screen.getByText("Not Found (1)")).toBeInTheDocument()
    })

    it("clicking error feed in expanded category calls onEditFeed", async () => {
      const user = userEvent.setup()
      const onEditFeed = vi.fn()
      const feeds = [
        mockFeed({ id: 1, title: "Broken Feed", last_error: "Feed not found", category_id: 1 }),
      ]
      const categories = [mockCategory({ id: 1, title: "Tech" })]

      render(
        <FeedSidebar {...defaultProps} feeds={feeds} categories={categories} onEditFeed={onEditFeed} />
      )

      // Expand error folder first
      await user.click(screen.getByText("Errors (1)"))

      // Expand error category group
      await user.click(screen.getByText("Not Found (1)"))

      // Find and click the feed in the error section
      const feedButtons = screen.getAllByText("Broken Feed")
      await user.click(feedButtons[0])

      expect(onEditFeed).toHaveBeenCalledWith(feeds[0])
    })
  })

  describe("add menu", () => {
    it("opens dropdown when Add button clicked", async () => {
      const user = userEvent.setup()

      render(<FeedSidebar {...defaultProps} />)

      await user.click(screen.getByRole("button", { name: /add\.\.\./i }))

      expect(screen.getByText("Subscribe to Feed")).toBeInTheDocument()
      expect(screen.getByText("New Category")).toBeInTheDocument()
    })

    it("clicking Subscribe to Feed calls onSubscribe", async () => {
      const user = userEvent.setup()
      const onSubscribe = vi.fn()

      render(<FeedSidebar {...defaultProps} onSubscribe={onSubscribe} />)

      await user.click(screen.getByRole("button", { name: /add\.\.\./i }))
      await user.click(screen.getByText("Subscribe to Feed"))

      expect(onSubscribe).toHaveBeenCalledOnce()
    })
  })

  describe("preference toggles", () => {
    it("hide read toggle updates preference", async () => {
      const user = userEvent.setup()

      render(<FeedSidebar {...defaultProps} />)

      await user.click(screen.getByRole("button", { name: /hide read feeds/i }))

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

    // The rule used to be written twice inside this render, once for roots and
    // once for children, and both copies looked exactly one level down. A feed
    // two levels deep therefore took its own parent off screen and went with
    // it. Both copies now defer to visibleCategoryIds, which walks the whole
    // subtree (ttrb-ziba).
    it("keeps every folder above an unread feed, however deep it sits", () => {
      mockPreferences.hide_read_feeds = "true"
      const categories = [
        mockCategory({ id: 1, title: "Technology" }),
        mockCategory({ id: 2, title: "Programming", parent_id: 1 }),
        mockCategory({ id: 3, title: "Rust", parent_id: 2 }),
      ]
      const feeds = [
        mockFeed({ id: 1, title: "Rust Weekly", category_id: 3, unread_count: 4 }),
      ]

      render(
        <FeedSidebar {...defaultProps} feeds={feeds} categories={categories} />
      )

      expect(screen.getByText("Technology")).toBeInTheDocument()
      expect(screen.getByText("Programming")).toBeInTheDocument()
      expect(screen.getByText("Rust")).toBeInTheDocument()
      expect(screen.getByText("Rust Weekly")).toBeInTheDocument()
    })

    it("sort by unread toggle updates preference", async () => {
      const user = userEvent.setup()

      render(<FeedSidebar {...defaultProps} />)

      await user.click(screen.getByRole("button", { name: /sort by unread count/i }))

      expect(mockUpdatePreference).toHaveBeenCalledWith(
        "feeds_sort_by_unread",
        "true"
      )
    })
  })

  describe("feed selection highlighting", () => {
    it("selected feed has accent background", () => {
      const feeds = [mockFeed({ id: 5, title: "Selected Feed" })]

      render(
        <FeedSidebar {...defaultProps} feeds={feeds} selectedFeedId={5} />
      )

      // The selected feed button should have inline background style
      const feedButton = screen.getByText("Selected Feed").closest("button")
      // Check that the style attribute contains the CSS variable reference
      expect(feedButton).toHaveAttribute(
        "style",
        expect.stringContaining("accent-primary-dark")
      )
    })
  })

  describe("category context menu", () => {
    it("shows rename option in category menu", async () => {
      const user = userEvent.setup()
      const categories = [mockCategory({ id: 1, title: "My Tech Category" })]

      render(<FeedSidebar {...defaultProps} categories={categories} />)

      await user.click(screen.getByRole("button", { name: /my tech category menu/i }))

      expect(screen.getByText("Rename")).toBeInTheDocument()
    })

    it("shows delete option in category menu", async () => {
      const user = userEvent.setup()
      const categories = [mockCategory({ id: 1, title: "My Tech Category" })]

      render(<FeedSidebar {...defaultProps} categories={categories} />)

      await user.click(screen.getByRole("button", { name: /my tech category menu/i }))

      expect(screen.getByText("Delete")).toBeInTheDocument()
    })
  })

  describe("feed context menu", () => {
    it("shows Edit Feed option in feed menu", async () => {
      const user = userEvent.setup()
      const feeds = [mockFeed({ id: 1, title: "My Feed" })]

      render(<FeedSidebar {...defaultProps} feeds={feeds} />)

      await user.click(screen.getByRole("button", { name: /my feed menu/i }))

      expect(screen.getByText("Edit Feed")).toBeInTheDocument()
    })

    it("clicking Edit Feed calls onEditFeed", async () => {
      const user = userEvent.setup()
      const onEditFeed = vi.fn()
      const feeds = [mockFeed({ id: 1, title: "My Feed" })]

      render(
        <FeedSidebar {...defaultProps} feeds={feeds} onEditFeed={onEditFeed} />
      )

      await user.click(screen.getByRole("button", { name: /my feed menu/i }))
      await user.click(screen.getByText("Edit Feed"))

      expect(onEditFeed).toHaveBeenCalledWith(feeds[0])
    })
  })

  describe("feeds nested inside a smart folder", () => {
    // A feed in a collapsed category with no newest_entry_date renders only
    // inside the "Dead Letter Box" smart folder, so its menu is unambiguous.
    const nestedFeed = mockFeed({ id: 7, title: "Nested Feed", category_id: 1 })
    const categories = [mockCategory({ id: 1, title: "My Tech" })]

    const renderExpanded = async (props = {}) => {
      const user = userEvent.setup()
      localStorage.setItem("nibbler:expandedCategories", "[]")

      render(
        <FeedSidebar
          {...defaultProps}
          feeds={[nestedFeed]}
          categories={categories}
          {...props}
        />
      )

      // The smart folder's row and its overflow menu are both buttons whose
      // name starts with the folder name, so the menu has to be excluded.
      await user.click(
        screen.getByRole("button", { name: /dead letter box(?! menu)/i })
      )

      return user
    }

    it("renders the feed once the smart folder is expanded", async () => {
      await renderExpanded()

      expect(
        screen.getByRole("button", { name: /nested feed menu/i })
      ).toBeInTheDocument()
    })

    it("clicking Edit Feed calls onEditFeed with the feed", async () => {
      const onEditFeed = vi.fn()
      const user = await renderExpanded({ onEditFeed })

      await user.click(screen.getByRole("button", { name: /nested feed menu/i }))
      await user.click(screen.getByText("Edit Feed"))

      expect(onEditFeed).toHaveBeenCalledWith(nestedFeed)
    })

    it("clicking Sync Now refreshes the feed", async () => {
      const user = await renderExpanded()

      await user.click(screen.getByRole("button", { name: /nested feed menu/i }))
      await user.click(screen.getByText("Sync Now"))

      expect(api.feeds.refresh).toHaveBeenCalledWith(nestedFeed.id)
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

  describe("scrolling region", () => {
    // Deletion guard, not a catcher. Radix sizes the ScrollArea viewport's
    // inner wrapper to its content (`display: table`), which let long titles
    // widen the rows until the unread badges sat outside the sidebar; the
    // override below bounds it. This suite cannot see that: happy-dom loads no
    // stylesheet and lays nothing out, so every element here has a zero box and
    // answers every query regardless of its width. What this does catch is the
    // override being dropped in a refactor. The behaviour itself is proven in a
    // real browser by e2e/sidebar-badge-visibility.spec.ts.
    it("bounds the Radix viewport wrapper the category tree scrolls in", () => {
      const { container } = render(<FeedSidebar {...defaultProps} />)

      const scrollArea = container.querySelector('[data-slot="scroll-area"]')

      expect(scrollArea).not.toBeNull()
      expect(scrollArea?.className).toContain(
        "[&>[data-slot=scroll-area-viewport]>div]:block!"
      )
    })
  })

  describe("error indicators", () => {
    it("shows collapsible errors folder when last_error is set", () => {
      const feeds = [
        mockFeed({ id: 1, title: "Error Feed Only", last_error: "Connection timeout" }),
      ]

      render(<FeedSidebar {...defaultProps} feeds={feeds} />)

      // The error section should be shown with the error count in folder format
      expect(screen.getByText("Errors (1)")).toBeInTheDocument()
    })
  })
})
