import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { EntryList } from "./EntryList"
import { mockEntry } from "../../../test/fixtures/data"

// Mock the preferences context
const mockPreferences = {
  show_content_preview: "true",
  date_format: "relative",
}

vi.mock("@/contexts/PreferencesContext", () => ({
  usePreferences: () => ({
    preferences: mockPreferences,
    isLoading: false,
  }),
}))

// Mock useDateFormat
vi.mock("@/hooks/useDateFormat", () => ({
  useDateFormat: () => ({
    formatListDate: (date: Date | string) => "5m ago",
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
    mockPreferences.show_content_preview = "true"
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

    it("shows content preview when preference is true", () => {
      mockPreferences.show_content_preview = "true"
      const entries = [mockEntry({ content_preview: "This is a preview..." })]

      render(<EntryList {...defaultProps} entries={entries} />)

      expect(screen.getByText("This is a preview...")).toBeInTheDocument()
    })

    it("hides content preview when preference is false", () => {
      mockPreferences.show_content_preview = "false"
      const entries = [mockEntry({ content_preview: "This is a preview..." })]

      render(<EntryList {...defaultProps} entries={entries} />)

      expect(
        screen.queryByText("This is a preview...")
      ).not.toBeInTheDocument()
    })
  })

  describe("entry states", () => {
    it("unread entries have left border indicator", () => {
      const entries = [mockEntry({ id: 1, unread: true })]

      render(<EntryList {...defaultProps} entries={entries} />)

      const entryElement = screen.getByText("Test Entry").closest("[data-entry-id]")
      expect(entryElement).toHaveClass("border-l-2")
    })

    it("unread entries have bold title", () => {
      const entries = [mockEntry({ id: 1, unread: true })]

      render(<EntryList {...defaultProps} entries={entries} />)

      const titleElement = screen.getByText("Test Entry")
      expect(titleElement).toHaveClass("font-medium")
    })

    it("read entries have muted text", () => {
      const entries = [mockEntry({ id: 1, unread: false })]

      render(<EntryList {...defaultProps} entries={entries} />)

      const titleElement = screen.getByText("Test Entry")
      expect(titleElement).toHaveClass("text-muted-foreground")
    })

    it("selected entry has accent background", () => {
      const entries = [mockEntry({ id: 1 })]

      render(
        <EntryList {...defaultProps} entries={entries} selectedEntryId={1} />
      )

      const entryElement = screen.getByText("Test Entry").closest("[data-entry-id]")
      expect(entryElement).toHaveClass("bg-accent")
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
})
