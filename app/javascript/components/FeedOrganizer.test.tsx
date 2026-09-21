import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent, { type UserEvent } from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { FeedOrganizer } from "./FeedOrganizer"
import { api } from "@/lib/api"
import { mockFeed, mockCategory } from "../../../test/fixtures/data"
import { PageShortcuts } from "../../../test/mocks/pageShortcuts"
import { stackRows } from "../../../test/helpers/dndRowLayout"

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

  // A keyboard drag answers Space, Enter, Escape and the arrows on a grip.
  // Those are also the page's shortcuts behind the settings dialog, and this
  // list's own toggle, edit, deselect and navigate keys.
  describe("the drag handle's keys, the page shortcuts and the tree's own keys", () => {
    const categories = [mockCategory({ id: 1, title: "Tech" })]
    const feeds = [
      mockFeed({ id: 1, title: "First Feed", category_id: 1 }),
      mockFeed({ id: 2, title: "Second Feed", category_id: 1 }),
    ]

    function renderWithShortcuts() {
      const onKey = vi.fn()
      render(
        <>
          <PageShortcuts onKey={onKey} />
          <FeedOrganizer {...defaultProps} feeds={feeds} categories={categories} />
        </>
      )
      return { onKey }
    }

    function gripOf(name: RegExp): HTMLElement {
      const row = screen.getByRole("option", { name })
      const grip = row.querySelector<HTMLElement>('[aria-roledescription="sortable"]')
      expect(grip).not.toBeNull()
      grip!.focus()
      expect(grip).toHaveFocus()
      return grip!
    }

    const expectLifted = (grip: HTMLElement) =>
      waitFor(() => expect(grip).toHaveAttribute("aria-pressed", "true"))

    const expectPutDown = (grip: HTMLElement) =>
      waitFor(() => expect(grip).not.toHaveAttribute("aria-pressed", "true"))

    /**
     * Cancels a drag a test leaves lifted. dnd-kit attaches the sensor's
     * document keydown listener on pickup and detaches it on drop, so a row
     * still lifted at unmount leaves it attached, preventing the default on
     * the next test's keys.
     */
    async function endDrag(user: UserEvent, grip: HTMLElement) {
      await user.keyboard("{Escape}")
      await expectPutDown(grip)
    }

    it.each([
      ["Space", " "],
      ["Enter", "{Enter}"],
    ])("%s picks a feed up and puts it down without reaching the page shortcuts", async (_name, key) => {
      const user = userEvent.setup()
      const { onKey } = renderWithShortcuts()
      const grip = gripOf(/first feed/i)

      await user.keyboard(key)
      await expectLifted(grip)
      await user.keyboard("{ArrowDown}")
      await user.keyboard(key)
      await expectPutDown(grip)

      expect(onKey).not.toHaveBeenCalled()
    })

    it("Escape puts a lifted feed back without reaching the page shortcuts", async () => {
      const user = userEvent.setup()
      const { onKey } = renderWithShortcuts()
      const grip = gripOf(/first feed/i)

      await user.keyboard(" ")
      await expectLifted(grip)
      await user.keyboard("{Escape}")
      await expectPutDown(grip)

      expect(onKey).not.toHaveBeenCalled()
    })

    it("Space on a selected category's grip lifts it instead of collapsing it", async () => {
      const user = userEvent.setup()
      renderWithShortcuts()

      await user.click(screen.getByRole("option", { name: /tech/i }))
      const grip = gripOf(/tech/i)

      await user.keyboard(" ")
      await expectLifted(grip)

      expect(screen.getByText("First Feed")).toBeInTheDocument()

      await endDrag(user, grip)
    })

    it("an arrow key that moves a lifted row leaves the tree's selection alone", async () => {
      const user = userEvent.setup()
      renderWithShortcuts()

      await user.click(screen.getByRole("option", { name: /first feed/i }))
      const grip = gripOf(/first feed/i)

      await user.keyboard(" ")
      await expectLifted(grip)
      await user.keyboard("{ArrowDown}")

      expect(screen.getByRole("option", { name: /first feed/i })).toHaveAttribute(
        "aria-selected",
        "true"
      )

      await endDrag(user, grip)
    })

    it("leaves the keys it does not use to the page shortcuts", async () => {
      const user = userEvent.setup()
      const { onKey } = renderWithShortcuts()
      const grip = gripOf(/first feed/i)

      await user.keyboard(" ")
      await expectLifted(grip)
      await user.keyboard("x")

      expect(onKey).toHaveBeenCalledTimes(1)
      expect(onKey).toHaveBeenCalledWith("x")

      await endDrag(user, grip)
    })

    it("leaves Escape on a feed that is not lifted to the page shortcuts", async () => {
      const user = userEvent.setup()
      const { onKey } = renderWithShortcuts()
      gripOf(/first feed/i)

      await user.keyboard("{Escape}")

      expect(onKey).toHaveBeenCalledTimes(1)
      expect(onKey).toHaveBeenCalledWith("Escape")
    })
  })

  describe("drag handles for screen readers", () => {
    // One feed per category, so an arrow key off a feed lands on the next
    // category: the drop the tree actually acts on.
    const categories = [mockCategory({ id: 1, title: "Tech" }), mockCategory({ id: 2, title: "News" })]
    const feeds = [
      mockFeed({ id: 1, title: "First Feed", category_id: 1 }),
      mockFeed({ id: 2, title: "Second Feed", category_id: 2 }),
    ]
    const treeProps = { ...defaultProps, feeds, categories }

    it("names each grip after the feed or category it moves", () => {
      render(<FeedOrganizer {...treeProps} />)

      for (const name of ["Tech", "News", "First Feed", "Second Feed"]) {
        expect(screen.getByRole("button", { name: `Move ${name}` })).toBeInTheDocument()
      }
    })

    it("describes how to move a row with the keyboard", () => {
      render(<FeedOrganizer {...treeProps} />)

      expect(screen.getByRole("button", { name: "Move First Feed" })).toHaveAccessibleDescription(
        "To move a feed, press Space or Enter to pick it up. Use the up and down arrow keys to move it over a category, then press Space or Enter to drop it in. Press Escape to cancel."
      )
    })

    describe("announcements", () => {
      beforeEach(() => {
        stackRows('[role="option"]')
      })

      afterEach(() => {
        vi.restoreAllMocks()
      })

      async function pickUp(name: string) {
        const user = userEvent.setup()
        render(<FeedOrganizer {...treeProps} />)
        const grip = screen.getByRole("button", { name: `Move ${name}` })
        grip.focus()
        await user.keyboard(" ")
        await waitFor(() => expect(grip).toHaveAttribute("aria-pressed", "true"))
        return user
      }

      async function expectAnnounced(text: string) {
        await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(text))
      }

      it("name the feed when one is picked up", async () => {
        await pickUp("First Feed")

        await expectAnnounced("Picked up First Feed.")
      })

      it("name what a lifted feed is over", async () => {
        const user = await pickUp("First Feed")

        await user.keyboard("{ArrowDown}")

        await expectAnnounced("First Feed is over News.")
      })

      it("name the category a dropped feed lands in", async () => {
        const user = await pickUp("First Feed")
        await user.keyboard("{ArrowDown}")
        await expectAnnounced("First Feed is over News.")

        await user.keyboard(" ")

        await expectAnnounced("Moved First Feed to News.")
        await waitFor(() =>
          expect(api.feeds.update).toHaveBeenCalledWith(1, { feed: { category_id: 2 } })
        )
      })

      it("say nothing moved when a category is dropped, because the tree keeps no category order", async () => {
        const user = await pickUp("Tech")
        await user.keyboard("{ArrowDown}")
        await expectAnnounced("Tech is over First Feed.")

        await user.keyboard(" ")

        await expectAnnounced("Dropped Tech. Nothing moved.")
        expect(api.feeds.update).not.toHaveBeenCalled()
      })

      it("name the feed a canceled move leaves where it was", async () => {
        const user = await pickUp("First Feed")
        await user.keyboard("{ArrowDown}")
        await expectAnnounced("First Feed is over News.")

        await user.keyboard("{Escape}")

        await expectAnnounced("Move canceled. First Feed is back where it was.")
        expect(api.feeds.update).not.toHaveBeenCalled()
      })
    })
  })
})
