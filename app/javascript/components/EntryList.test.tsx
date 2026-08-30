import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { EntryList } from "./EntryList"
import { mockEntry, mockSearchResult } from "../../../test/fixtures/data"

// Mock the preferences context
const mockPreferences = {
  show_content_preview: "true",
  date_format: "relative",
  entries_sort_by_score: "false",
  entries_hide_read: "false",
  entries_hide_unstarred: "false",
  entries_display_density: "large",
}

const mockUpdatePreference = vi.fn()

vi.mock("@/contexts/PreferencesContext", () => ({
  usePreferences: () => ({
    preferences: mockPreferences,
    updatePreference: mockUpdatePreference,
    isLoading: false,
  }),
}))

// Mock useDateFormat
vi.mock("@/hooks/useDateFormat", () => ({
  useDateFormat: () => ({
    formatListDate: (_date: Date | string) => "5m ago",
  }),
}))

describe("EntryList", () => {
  const defaultProps = {
    entries: [],
    selectedEntryId: null,
    onSelectEntry: vi.fn(),
    onToggleRead: vi.fn(),
    onToggleStarred: vi.fn(),
    onMarkAllRead: vi.fn(),
    isLoading: false,
    title: "All Entries",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockPreferences.entries_display_density = "large"
  })

  describe("empty and loading states", () => {
    it('shows "Loading..." when isLoading is true', () => {
      render(<EntryList {...defaultProps} isLoading={true} />)

      expect(screen.getByText("Loading...")).toBeInTheDocument()
    })

    it('shows "No entries" when entries array is empty', () => {
      render(<EntryList {...defaultProps} entries={[]} />)

      expect(screen.getByText("No entries")).toBeInTheDocument()
    })

    it("displays title in header", () => {
      render(<EntryList {...defaultProps} title="Tech News" />)

      expect(screen.getByText("Tech News")).toBeInTheDocument()
    })

    it("shows unread count badge when > 0", () => {
      const entries = [
        mockEntry({ id: 1, unread: true }),
        mockEntry({ id: 2, unread: true }),
        mockEntry({ id: 3, unread: false }),
      ]

      render(<EntryList {...defaultProps} entries={entries} />)

      expect(screen.getByText("2")).toBeInTheDocument()
    })

    it("hides badge when unread count is 0", () => {
      const entries = [
        mockEntry({ id: 1, unread: false }),
        mockEntry({ id: 2, unread: false }),
      ]

      render(<EntryList {...defaultProps} entries={entries} />)

      // Badge with count shouldn't be present
      expect(screen.queryByText("0")).not.toBeInTheDocument()
    })
  })

  describe("entry list rendering", () => {
    it("renders all entries in the list", () => {
      const entries = [
        mockEntry({ id: 1, title: "First Article" }),
        mockEntry({ id: 2, title: "Second Article" }),
        mockEntry({ id: 3, title: "Third Article" }),
      ]

      render(<EntryList {...defaultProps} entries={entries} />)

      expect(screen.getByText("First Article")).toBeInTheDocument()
      expect(screen.getByText("Second Article")).toBeInTheDocument()
      expect(screen.getByText("Third Article")).toBeInTheDocument()
    })

    it("shows entry title", () => {
      const entries = [mockEntry({ title: "My Test Article" })]

      render(<EntryList {...defaultProps} entries={entries} />)

      expect(screen.getByText("My Test Article")).toBeInTheDocument()
    })

    it("shows feed title", () => {
      const entries = [mockEntry({ feed_title: "Tech Blog" })]

      render(<EntryList {...defaultProps} entries={entries} />)

      expect(screen.getByText("Tech Blog")).toBeInTheDocument()
    })

    it("shows formatted date", () => {
      const entries = [mockEntry()]

      render(<EntryList {...defaultProps} entries={entries} />)

      expect(screen.getByText("5m ago")).toBeInTheDocument()
    })

    it("shows content preview when density is large", () => {
      mockPreferences.entries_display_density = "large"
      const entries = [mockEntry({ content_preview: "This is a preview..." })]

      render(<EntryList {...defaultProps} entries={entries} />)

      expect(screen.getByText("This is a preview...")).toBeInTheDocument()
    })

    it("hides content preview when density is medium", () => {
      mockPreferences.entries_display_density = "medium"
      const entries = [mockEntry({ content_preview: "This is a preview..." })]

      render(<EntryList {...defaultProps} entries={entries} />)

      expect(
        screen.queryByText("This is a preview...")
      ).not.toBeInTheDocument()
    })

    it("hides content preview and feed info when density is small", () => {
      mockPreferences.entries_display_density = "small"
      const entries = [mockEntry({ content_preview: "This is a preview...", feed_title: "Tech Blog" })]

      render(<EntryList {...defaultProps} entries={entries} />)

      expect(screen.queryByText("This is a preview...")).not.toBeInTheDocument()
      expect(screen.queryByText("Tech Blog")).not.toBeInTheDocument()
    })
  })

  describe("entry states", () => {
    it("unread entries are marked as unread", () => {
      const entries = [mockEntry({ id: 1, unread: true })]

      render(<EntryList {...defaultProps} entries={entries} />)

      const entryElement = screen.getByRole("option", { name: /test entry/i })
      expect(entryElement).toHaveAttribute("data-unread", "true")
    })

    it("read entries are marked as read", () => {
      const entries = [mockEntry({ id: 1, unread: false })]

      render(<EntryList {...defaultProps} entries={entries} />)

      const entryElement = screen.getByRole("option", { name: /test entry/i })
      expect(entryElement).toHaveAttribute("data-unread", "false")
    })

    it("selected entry is marked as selected", () => {
      const entries = [mockEntry({ id: 1 })]

      render(
        <EntryList {...defaultProps} entries={entries} selectedEntryId={1} />
      )

      const entryElement = screen.getByRole("option", { name: /test entry/i })
      expect(entryElement).toHaveAttribute("aria-selected", "true")
    })

    it("unselected entry is marked as not selected", () => {
      const entries = [mockEntry({ id: 1 })]

      render(
        <EntryList {...defaultProps} entries={entries} selectedEntryId={null} />
      )

      const entryElement = screen.getByRole("option", { name: /test entry/i })
      expect(entryElement).toHaveAttribute("aria-selected", "false")
    })
  })

  describe("interactions", () => {
    it("clicking entry calls onSelectEntry with entry ID", async () => {
      const user = userEvent.setup()
      const onSelectEntry = vi.fn()
      const entries = [mockEntry({ id: 42 })]

      render(
        <EntryList
          {...defaultProps}
          entries={entries}
          onSelectEntry={onSelectEntry}
        />
      )

      await user.click(screen.getByText("Test Entry"))

      expect(onSelectEntry).toHaveBeenCalledWith(42)
    })

    it("clicking read indicator calls onToggleRead", async () => {
      const user = userEvent.setup()
      const onToggleRead = vi.fn()
      const onSelectEntry = vi.fn()
      const entries = [mockEntry({ id: 1, unread: true })]

      render(
        <EntryList
          {...defaultProps}
          entries={entries}
          onToggleRead={onToggleRead}
          onSelectEntry={onSelectEntry}
        />
      )

      await user.click(screen.getByRole("button", { name: /mark as read/i }))

      expect(onToggleRead).toHaveBeenCalledWith(1)
      // Should not propagate to select
      expect(onSelectEntry).not.toHaveBeenCalled()
    })

    it("clicking star icon calls onToggleStarred", async () => {
      const user = userEvent.setup()
      const onToggleStarred = vi.fn()
      const onSelectEntry = vi.fn()
      const entries = [mockEntry({ id: 1 })]

      render(
        <EntryList
          {...defaultProps}
          entries={entries}
          onToggleStarred={onToggleStarred}
          onSelectEntry={onSelectEntry}
        />
      )

      await user.click(screen.getByRole("button", { name: /add star/i }))

      expect(onToggleStarred).toHaveBeenCalledWith(1)
      // Should not propagate to select
      expect(onSelectEntry).not.toHaveBeenCalled()
    })

    it("Mark read button calls onMarkAllRead", async () => {
      const user = userEvent.setup()
      const onMarkAllRead = vi.fn()
      const entries = [mockEntry({ unread: true })]

      render(
        <EntryList
          {...defaultProps}
          entries={entries}
          onMarkAllRead={onMarkAllRead}
        />
      )

      await user.click(screen.getByRole("button", { name: /mark read/i }))

      expect(onMarkAllRead).toHaveBeenCalledOnce()
    })

    it("Mark read button is disabled when no unread entries", () => {
      const entries = [mockEntry({ unread: false })]

      render(<EntryList {...defaultProps} entries={entries} />)

      const button = screen.getByRole("button", { name: /mark read/i })
      expect(button).toBeDisabled()
    })
  })

  describe("edge cases", () => {
    it("handles entry without feed_title", () => {
      const entries = [mockEntry({ feed_title: null })]

      render(<EntryList {...defaultProps} entries={entries} />)

      // Should still render without error
      expect(screen.getByText("Test Entry")).toBeInTheDocument()
    })

    it("handles entry without content_preview", () => {
      const entries = [mockEntry({ content_preview: null })]

      render(<EntryList {...defaultProps} entries={entries} />)

      // Should still render without error
      expect(screen.getByText("Test Entry")).toBeInTheDocument()
    })

    it("handles large number of entries", () => {
      const entries = Array.from({ length: 100 }, (_, i) =>
        mockEntry({ id: i + 1, title: `Article ${i + 1}` })
      )

      render(<EntryList {...defaultProps} entries={entries} />)

      expect(screen.getByText("Article 1")).toBeInTheDocument()
      expect(screen.getByText("Article 100")).toBeInTheDocument()
    })
  })

  describe("boundary flash feedback", () => {
    it("applies flash animation class to first entry when boundaryHit is 'start'", () => {
      const entries = [
        mockEntry({ id: 1, title: "First Article" }),
        mockEntry({ id: 2, title: "Second Article" }),
      ]

      render(<EntryList {...defaultProps} entries={entries} boundaryHit="start" />)

      const firstEntry = screen.getByRole("option", { name: /first article/i })
      const secondEntry = screen.getByRole("option", { name: /second article/i })

      expect(firstEntry).toHaveClass("animate-boundary-flash")
      expect(secondEntry).not.toHaveClass("animate-boundary-flash")
    })

    it("applies flash animation class to last entry when boundaryHit is 'end'", () => {
      const entries = [
        mockEntry({ id: 1, title: "First Article" }),
        mockEntry({ id: 2, title: "Last Article" }),
      ]

      render(<EntryList {...defaultProps} entries={entries} boundaryHit="end" />)

      const firstEntry = screen.getByRole("option", { name: /first article/i })
      const lastEntry = screen.getByRole("option", { name: /last article/i })

      expect(firstEntry).not.toHaveClass("animate-boundary-flash")
      expect(lastEntry).toHaveClass("animate-boundary-flash")
    })

    it("does not apply flash animation when boundaryHit is null", () => {
      const entries = [
        mockEntry({ id: 1, title: "First Article" }),
        mockEntry({ id: 2, title: "Last Article" }),
      ]

      render(<EntryList {...defaultProps} entries={entries} boundaryHit={null} />)

      const firstEntry = screen.getByRole("option", { name: /first article/i })
      const lastEntry = screen.getByRole("option", { name: /last article/i })

      expect(firstEntry).not.toHaveClass("animate-boundary-flash")
      expect(lastEntry).not.toHaveClass("animate-boundary-flash")
    })
  })

  describe("search", () => {
    const idleSearch = {
      query: "",
      onQueryChange: vi.fn(),
      onDismiss: vi.fn(),
      inputRef: null,
      isActive: false,
      isSearching: false,
      results: [],
      error: null,
    }

    it("shows no search box unless the caller supplies search state", () => {
      render(<EntryList {...defaultProps} />)

      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument()
    })

    it("shows the box above the list when search state is supplied", () => {
      render(<EntryList {...defaultProps} search={idleSearch} />)

      expect(screen.getByRole("searchbox", { name: "Search articles" })).toBeInTheDocument()
    })

    it("hides the box in feed-list mode, which search cannot answer", () => {
      render(
        <EntryList
          {...defaultProps}
          search={idleSearch}
          displayMode="feeds"
          filteredFeeds={[]}
        />
      )

      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument()
    })

    it("keeps showing the entry list while the query is blank", () => {
      render(
        <EntryList
          {...defaultProps}
          entries={[mockEntry({ id: 1, title: "Unfiltered Article" })]}
          search={idleSearch}
        />
      )

      expect(screen.getByRole("listbox", { name: "Entries" })).toBeInTheDocument()
      expect(screen.getByText("Unfiltered Article")).toBeInTheDocument()
    })

    it("replaces the entry list with the hits once a query is active", () => {
      render(
        <EntryList
          {...defaultProps}
          entries={[mockEntry({ id: 1, title: "Unfiltered Article" })]}
          search={{
            ...idleSearch,
            query: "rails",
            isActive: true,
            results: [mockSearchResult({ id: 9, title: "Rails 8 released" })],
          }}
        />
      )

      expect(screen.getByRole("listbox", { name: "Search results" })).toBeInTheDocument()
      // By role: SearchResultList marks the query terms, so the hit's title is
      // split across a <mark> and getByText no longer sees it in one node.
      expect(screen.getByRole("option", { name: /rails 8 released/i })).toBeInTheDocument()
      expect(screen.queryByText("Unfiltered Article")).not.toBeInTheDocument()
    })

    it("routes a clicked hit through onSelectEntry", async () => {
      const user = userEvent.setup()
      const onSelectEntry = vi.fn()

      render(
        <EntryList
          {...defaultProps}
          onSelectEntry={onSelectEntry}
          search={{
            ...idleSearch,
            query: "rails",
            isActive: true,
            results: [mockSearchResult({ id: 9, title: "Rails 8 released" })],
          }}
        />
      )

      await user.click(screen.getByRole("option", { name: /rails 8 released/i }))

      expect(onSelectEntry).toHaveBeenCalledWith(9)
    })

    describe("sorting the hits", () => {
      const activeSearch = {
        ...idleSearch,
        query: "rails",
        isActive: true,
        sortConfig: [{ column: "relevance" as const, direction: "desc" as const }],
      }

      it("keeps the sort controls up during a search, offering relevance", () => {
        render(
          <EntryList
            {...defaultProps}
            onSortChange={vi.fn()}
            search={{ ...activeSearch, onSortChange: vi.fn() }}
          />
        )

        expect(screen.getByText("Sort:")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /relevance/i })).toBeInTheDocument()
      })

      // Score is the column a search hit does not carry: SearchResult has no
      // score and the row draws none, so ordering by it would rearrange the
      // list around a value nobody can see.
      it("drops the columns a search hit does not carry", () => {
        render(
          <EntryList
            {...defaultProps}
            onSortChange={vi.fn()}
            search={{ ...activeSearch, onSortChange: vi.fn() }}
          />
        )

        expect(screen.queryByRole("button", { name: /score/i })).not.toBeInTheDocument()
      })

      it("offers relevance only while a query is active", () => {
        render(<EntryList {...defaultProps} search={idleSearch} onSortChange={vi.fn()} />)

        expect(screen.getByText("Sort:")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /relevance/i })).not.toBeInTheDocument()
      })

      it("routes a sort click to the search's handler, leaving the list's alone", async () => {
        const user = userEvent.setup()
        const onSortChange = vi.fn()
        const onSearchSortChange = vi.fn()

        render(
          <EntryList
            {...defaultProps}
            onSortChange={onSortChange}
            search={{ ...activeSearch, onSortChange: onSearchSortChange }}
          />
        )

        await user.click(screen.getByRole("button", { name: /^date/i }))

        expect(onSearchSortChange).toHaveBeenCalledWith([
          { column: "date", direction: "desc" },
        ])
        expect(onSortChange).not.toHaveBeenCalled()
      })

      // Relevance ascending is "worst match first". Clicking the column a
      // second time has to leave it where it is rather than offer that.
      it("never turns relevance around", async () => {
        const user = userEvent.setup()
        const onSearchSortChange = vi.fn()

        render(
          <EntryList
            {...defaultProps}
            search={{ ...activeSearch, onSortChange: onSearchSortChange }}
          />
        )

        await user.click(screen.getByRole("button", { name: /relevance/i }))

        expect(onSearchSortChange).toHaveBeenCalledWith([
          { column: "relevance", direction: "desc" },
        ])
      })

      it("shows the list's own sort again once the query is cleared", () => {
        const { rerender } = render(
          <EntryList
            {...defaultProps}
            sortConfig={[{ column: "title", direction: "asc" }]}
            onSortChange={vi.fn()}
            search={{ ...activeSearch, onSortChange: vi.fn() }}
          />
        )

        expect(screen.getByRole("button", { name: /relevance/i })).toBeInTheDocument()

        rerender(
          <EntryList
            {...defaultProps}
            sortConfig={[{ column: "title", direction: "asc" }]}
            onSortChange={vi.fn()}
            search={idleSearch}
          />
        )

        expect(screen.queryByRole("button", { name: /relevance/i })).not.toBeInTheDocument()
        expect(screen.getByRole("button", { name: /score/i })).toBeInTheDocument()
      })

      it("hides the controls during a search the caller gave no sort handler", () => {
        render(
          <EntryList
            {...defaultProps}
            onSortChange={vi.fn()}
            search={{ ...idleSearch, query: "rails", isActive: true }}
          />
        )

        expect(screen.queryByText("Sort:")).not.toBeInTheDocument()
      })
    })

    describe("scope", () => {
      const scope = {
        place: "list" as const,
        history: "list" as const,
        onPlaceChange: vi.fn(),
        onHistoryChange: vi.fn(),
        placeLabel: "Ruby Weekly",
        historyLabel: "Unread",
      }

      it("shows the scope the hits came from under the box", () => {
        render(
          <EntryList
            {...defaultProps}
            search={{ ...idleSearch, query: "rails", isActive: true, scope }}
          />
        )

        const group = screen.getByRole("group", { name: "Search scope" })
        expect(group).toHaveTextContent("Ruby Weekly")
        expect(group).toHaveTextContent("Unread")
      })

      it("hands a pill press back to the caller", async () => {
        const user = userEvent.setup()
        const onPlaceChange = vi.fn()
        render(
          <EntryList
            {...defaultProps}
            search={{
              ...idleSearch,
              query: "rails",
              isActive: true,
              scope: { ...scope, onPlaceChange },
            }}
          />
        )

        await user.click(screen.getByRole("button", { name: "Ruby Weekly" }))

        expect(onPlaceChange).toHaveBeenCalledWith("everything")
      })

      it("offers the count from outside the scope on an empty result set", async () => {
        const user = userEvent.setup()
        const onWiden = vi.fn()
        render(
          <EntryList
            {...defaultProps}
            search={{
              ...idleSearch,
              query: "zzzz",
              isActive: true,
              scope,
              scopeLabel: "Ruby Weekly, unread",
              widerMatchCount: 42,
              onWiden,
            }}
          />
        )

        expect(
          screen.getByText(/no matches for "zzzz" in ruby weekly, unread/i)
        ).toBeInTheDocument()
        await user.click(
          screen.getByRole("button", { name: "42 matches in all articles" })
        )

        expect(onWiden).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe("new entries affordance", () => {
    const idleSearch = {
      query: "",
      onQueryChange: vi.fn(),
      onDismiss: vi.fn(),
      inputRef: null,
      isActive: false,
      isSearching: false,
      results: [],
      error: null,
    }

    it("shows nothing when the probe has found no new entries", () => {
      render(<EntryList {...defaultProps} newEntryCount={0} onShowNewEntries={vi.fn()} />)

      expect(screen.queryByRole("button", { name: /new article/i })).not.toBeInTheDocument()
    })

    it("shows nothing without a handler to pull the entries in", () => {
      render(<EntryList {...defaultProps} newEntryCount={3} />)

      expect(screen.queryByRole("button", { name: /new article/i })).not.toBeInTheDocument()
    })

    it("offers the entries the probe found", () => {
      render(<EntryList {...defaultProps} newEntryCount={3} onShowNewEntries={vi.fn()} />)

      expect(screen.getByRole("button", { name: "3 new articles" })).toBeInTheDocument()
    })

    it("uses the singular for a single new entry", () => {
      render(<EntryList {...defaultProps} newEntryCount={1} onShowNewEntries={vi.fn()} />)

      expect(screen.getByRole("button", { name: "1 new article" })).toBeInTheDocument()
    })

    it("pulls the entries in when clicked", async () => {
      const user = userEvent.setup()
      const onShowNewEntries = vi.fn()

      render(
        <EntryList {...defaultProps} newEntryCount={2} onShowNewEntries={onShowNewEntries} />
      )
      await user.click(screen.getByRole("button", { name: "2 new articles" }))

      expect(onShowNewEntries).toHaveBeenCalledTimes(1)
    })

    it("stays out of the way while a search owns the list", () => {
      render(
        <EntryList
          {...defaultProps}
          newEntryCount={4}
          onShowNewEntries={vi.fn()}
          search={{ ...idleSearch, query: "rails", isActive: true }}
        />
      )

      expect(screen.queryByRole("button", { name: /new article/i })).not.toBeInTheDocument()
    })

    it("stays out of the way in feed-list mode, which holds no entries", () => {
      render(
        <EntryList
          {...defaultProps}
          newEntryCount={4}
          onShowNewEntries={vi.fn()}
          displayMode="feeds"
          filteredFeeds={[]}
        />
      )

      expect(screen.queryByRole("button", { name: /new article/i })).not.toBeInTheDocument()
    })

    it("leaves the open entry selected when the count arrives", () => {
      const entries = [
        mockEntry({ id: 1, title: "First" }),
        mockEntry({ id: 2, title: "Reading This" }),
      ]
      const { rerender } = render(
        <EntryList {...defaultProps} entries={entries} selectedEntryId={2} />
      )

      rerender(
        <EntryList
          {...defaultProps}
          entries={entries}
          selectedEntryId={2}
          newEntryCount={5}
          onShowNewEntries={vi.fn()}
        />
      )

      expect(screen.getByRole("option", { name: /reading this/i })).toHaveAttribute(
        "aria-selected",
        "true"
      )
    })

    it("does not scroll the list when the count arrives", () => {
      const entries = [
        mockEntry({ id: 1, title: "First" }),
        mockEntry({ id: 2, title: "Reading This" }),
      ]
      const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView")
      const { rerender } = render(
        <EntryList {...defaultProps} entries={entries} selectedEntryId={2} />
      )

      // The mount scroll is the keyboard-navigation one; only what comes after
      // the count arrives is under test.
      scrollIntoView.mockClear()
      rerender(
        <EntryList
          {...defaultProps}
          entries={entries}
          selectedEntryId={2}
          newEntryCount={5}
          onShowNewEntries={vi.fn()}
        />
      )

      expect(scrollIntoView).not.toHaveBeenCalled()
      scrollIntoView.mockRestore()
    })
  })
})
