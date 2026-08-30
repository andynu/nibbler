import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { FeedOrganizer } from "./FeedOrganizer"
import { mockFeed, mockCategory } from "../../../test/fixtures/data"

// Mock API
vi.mock("@/lib/api", () => ({
  api: {
    feeds: {
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    categories: {
      create: vi.fn().mockResolvedValue({ id: 100, title: "New Category" }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
  },
}))

// Mock CommandPalette
vi.mock("@/components/CommandPalette", () => ({
  CommandPalette: () => null,
}))

// Mock PreferencesContext
vi.mock("@/contexts/PreferencesContext", () => ({
  usePreferences: () => ({
    preferences: {},
    updatePreference: vi.fn(),
    isLoading: false,
  }),
}))

describe("FeedOrganizer", () => {
  const defaultProps = {
    feeds: [],
    categories: [],
    onFeedsChange: vi.fn(),
    onCategoriesChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("rendering", () => {
    it("shows header title", () => {
      render(<FeedOrganizer {...defaultProps} />)

      expect(screen.getByText("Feeds & Categories")).toBeInTheDocument()
    })

    it("shows Add Category button", () => {
      render(<FeedOrganizer {...defaultProps} />)

      expect(screen.getByRole("button", { name: /add category/i })).toBeInTheDocument()
    })

    it("shows keyboard shortcuts help", () => {
      render(<FeedOrganizer {...defaultProps} />)

      expect(screen.getByText(/keyboard:/i)).toBeInTheDocument()
    })

    it("renders categories", () => {
      const categories = [
        mockCategory({ id: 1, title: "Tech" }),
        mockCategory({ id: 2, title: "News" }),
      ]

      render(<FeedOrganizer {...defaultProps} categories={categories} />)

      expect(screen.getByText("Tech")).toBeInTheDocument()
      expect(screen.getByText("News")).toBeInTheDocument()
    })

    it("renders uncategorized feeds", () => {
      const feeds = [
        mockFeed({ id: 1, title: "Uncategorized Feed", category_id: null }),
      ]

      render(<FeedOrganizer {...defaultProps} feeds={feeds} />)

      expect(screen.getByText("Uncategorized Feed")).toBeInTheDocument()
    })

    it("renders feeds within categories", () => {
      const categories = [mockCategory({ id: 1, title: "Tech" })]
      const feeds = [
        mockFeed({ id: 1, title: "Tech Blog", category_id: 1 }),
      ]

      render(
        <FeedOrganizer {...defaultProps} feeds={feeds} categories={categories} />
      )

      expect(screen.getByText("Tech Blog")).toBeInTheDocument()
    })

    it("shows feed count on category", () => {
      const categories = [mockCategory({ id: 1, title: "Tech" })]
      const feeds = [
        mockFeed({ id: 1, title: "Feed 1", category_id: 1 }),
        mockFeed({ id: 2, title: "Feed 2", category_id: 1 }),
      ]

      render(
        <FeedOrganizer {...defaultProps} feeds={feeds} categories={categories} />
      )

      expect(screen.getByText("2 feeds")).toBeInTheDocument()
    })

    it("shows feed icon when icon_url present", () => {
      const feeds = [
        mockFeed({
          id: 1,
          title: "Feed with Icon",
          icon_url: "https://example.com/icon.png",
        }),
      ]

      render(<FeedOrganizer {...defaultProps} feeds={feeds} />)

      const icon = screen.getByAltText("")
      expect(icon).toHaveAttribute("src", "https://example.com/icon.png")
    })

    it("renders feed with error", () => {
      const feeds = [
        mockFeed({ id: 1, title: "Error Feed", last_error: "Connection error" }),
      ]

      render(<FeedOrganizer {...defaultProps} feeds={feeds} />)

      // The feed should still be visible
      expect(screen.getByText("Error Feed")).toBeInTheDocument()
    })
  })

  describe("expand/collapse", () => {
    it("categories start expanded", () => {
      const categories = [mockCategory({ id: 1, title: "Tech" })]
      const feeds = [mockFeed({ id: 1, title: "Tech Feed", category_id: 1 })]

      render(
        <FeedOrganizer {...defaultProps} feeds={feeds} categories={categories} />
      )

      // Feed should be visible
      expect(screen.getByText("Tech Feed")).toBeInTheDocument()
    })
  })

  describe("selection", () => {
    it("clicking item selects it", async () => {
      const user = userEvent.setup()
      const feeds = [mockFeed({ id: 1, title: "Clickable Feed" })]

      render(<FeedOrganizer {...defaultProps} feeds={feeds} />)

      await user.click(screen.getByText("Clickable Feed"))

      // The item should be marked as selected via aria-selected
      const item = screen.getByRole("option", { name: /clickable feed/i })
      expect(item).toHaveAttribute("aria-selected", "true")
    })
  })

  describe("add category", () => {
    it("clicking Add Category prompts for name", async () => {
      const user = userEvent.setup()
      const promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null)

      render(<FeedOrganizer {...defaultProps} />)

      await user.click(screen.getByRole("button", { name: /add category/i }))

      expect(promptSpy).toHaveBeenCalledWith("Category name:")

      promptSpy.mockRestore()
    })
  })

  // The navigation listener used to be built inside a useEffect over
  // [selectedId, editingId, sortableIds, showQuickMove] and swapped into the
  // document from there. Passive effects run after paint, so a key pressed
  // between the paint of render N and the flush of render N's effects reached
  // render N-1's closure (ttrb-fuky, same class as ttrb-lix7). Held j on a long
  // feed list is the easy way in: each press re-renders the whole tree, and a
  // repeat arriving during that commit is dispatched before the effect swap.
  //
  // These tests are about the listener lifecycle rather than about catching the
  // window in the act. If there is only ever one listener and it reads state
  // written in the commit phase, no such window exists at any timing.
  describe("stale listener window (ttrb-fuky)", () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    // Testing Library, happy-dom and the Radix primitives inside the tree put
    // listeners on the document too, so narrow a spy's calls to keydown. Each
    // feed row renders its own TooltipProvider, which registers one, so the
    // mount total is counted rather than assumed.
    function keydownCalls(spy: { mock: { calls: unknown[][] } }): unknown[][] {
      return spy.mock.calls.filter((call) => call[0] === "keydown")
    }

    const twoFeeds = [
      mockFeed({ id: 1, title: "First Feed" }),
      mockFeed({ id: 2, title: "Second Feed" }),
    ]

    it("registers its listener once and never swaps it as state moves", async () => {
      const user = userEvent.setup()
      const addEventListenerSpy = vi.spyOn(document, "addEventListener")
      const removeEventListenerSpy = vi.spyOn(document, "removeEventListener")

      const { rerender } = render(
        <FeedOrganizer {...defaultProps} feeds={twoFeeds} />
      )
      const atMount = keydownCalls(addEventListenerSpy).length

      // Three moves of selectedId, which the old effect listed as a dependency.
      // The row set does not change, so nothing else in the tree registers
      // anything and the total has to stand still.
      await user.keyboard("{j}{k}{j}")
      expect(keydownCalls(addEventListenerSpy)).toHaveLength(atMount)

      // A new feeds array rebuilds sortableIds, the other dependency. The extra
      // row brings a TooltipProvider listener of its own, so count removals
      // instead: FeedOrganizer must not be swapping its listener out.
      rerender(
        <FeedOrganizer
          {...defaultProps}
          feeds={[...twoFeeds, mockFeed({ id: 3, title: "Third Feed" })]}
        />
      )
      expect(keydownCalls(removeEventListenerSpy)).toHaveLength(0)
    })

    it("routes through the mount-time listeners to the newest selection", async () => {
      const user = userEvent.setup()
      const addEventListenerSpy = vi.spyOn(document, "addEventListener")

      render(<FeedOrganizer {...defaultProps} feeds={twoFeeds} />)
      const atMount = keydownCalls(addEventListenerSpy).map(
        (call) => call[1] as EventListener
      )

      await user.keyboard("{j}")
      expect(screen.getByRole("option", { name: /first feed/i })).toHaveAttribute(
        "aria-selected",
        "true"
      )

      // Deliberately calls the function objects the document held at mount
      // rather than dispatching on it, because those objects are what a press
      // arriving before the effect swap reaches. Which of them belongs to
      // FeedOrganizer is not assumed; the Radix ones only set a focus-visible
      // flag.
      act(() => {
        for (const listener of atMount) {
          listener(new KeyboardEvent("keydown", { key: "j", cancelable: true }))
        }
      })

      // Stale: selectedId was still null, so navigateNext re-selected the first
      // row and the second j did nothing.
      expect(screen.getByRole("option", { name: /second feed/i })).toHaveAttribute(
        "aria-selected",
        "true"
      )
    })
  })
})
