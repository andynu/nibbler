import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { EntryContent } from "./EntryContent"
import { mockEntryWithContent } from "../../../test/fixtures/data"

// Mock the preferences context
const mockPreferences = {
  strip_images: "false",
}

vi.mock("@/contexts/PreferencesContext", () => ({
  usePreferences: () => ({
    preferences: mockPreferences,
    isLoading: false,
  }),
}))

// Mock EnclosurePlayer to keep tests focused
vi.mock("@/components/EnclosurePlayer", () => ({
  EnclosurePlayer: ({ enclosures }: { enclosures: unknown[] }) => (
    <div data-testid="enclosure-player">
      {enclosures.length} enclosures
    </div>
  ),
}))

describe("EntryContent", () => {
  const defaultProps = {
    entry: null,
    onToggleRead: vi.fn(),
    onToggleStarred: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    hasPrevious: true,
    hasNext: true,
    isLoading: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockPreferences.strip_images = "false"
  })

  describe("empty and loading states", () => {
    it('shows "Loading..." when isLoading is true', () => {
      render(<EntryContent {...defaultProps} isLoading={true} />)

      expect(screen.getByText("Loading...")).toBeInTheDocument()
    })

    it('shows "Select an entry to read" when entry is null', () => {
      render(<EntryContent {...defaultProps} entry={null} />)

      expect(screen.getByText("Select an entry to read")).toBeInTheDocument()
    })

    it("shows entry content when entry is provided", () => {
      const entry = mockEntryWithContent({ title: "Test Article Title" })

      render(<EntryContent {...defaultProps} entry={entry} />)

      expect(screen.getByText("Test Article Title")).toBeInTheDocument()
    })
  })

  describe("header navigation", () => {
    it("renders previous/next navigation buttons", () => {
      const entry = mockEntryWithContent()

      render(<EntryContent {...defaultProps} entry={entry} />)

      const buttons = screen.getAllByRole("button")
      expect(buttons.length).toBeGreaterThanOrEqual(4) // prev, next, read, star
    })

    it("previous button is disabled when hasPrevious is false", () => {
      const entry = mockEntryWithContent()

      render(
        <EntryContent {...defaultProps} entry={entry} hasPrevious={false} />
      )

      // Find the button with ChevronLeft icon (first button)
      const buttons = screen.getAllByRole("button")
      const prevButton = buttons[0]
      expect(prevButton).toBeDisabled()
    })

    it("next button is disabled when hasNext is false", () => {
      const entry = mockEntryWithContent()

      render(<EntryContent {...defaultProps} entry={entry} hasNext={false} />)

      // Find the button with ChevronRight icon (second button)
      const buttons = screen.getAllByRole("button")
      const nextButton = buttons[1]
      expect(nextButton).toBeDisabled()
    })

    it("shows read/unread toggle button", () => {
      const entry = mockEntryWithContent({ unread: true })

      render(<EntryContent {...defaultProps} entry={entry} />)

      // Circle icon for read indicator
      const circleIcon = document.querySelector("svg.lucide-circle")
      expect(circleIcon).toBeInTheDocument()
    })

    it("shows star toggle button", () => {
      const entry = mockEntryWithContent()

      render(<EntryContent {...defaultProps} entry={entry} />)

      // Star icon
      const starIcon = document.querySelector("svg.lucide-star")
      expect(starIcon).toBeInTheDocument()
    })

    it("shows external link button", () => {
      const entry = mockEntryWithContent()

      render(<EntryContent {...defaultProps} entry={entry} />)

      // External link icon
      const linkIcon = document.querySelector("svg.lucide-external-link")
      expect(linkIcon).toBeInTheDocument()
    })
  })

  describe("article rendering", () => {
    it("displays entry title as link", () => {
      const entry = mockEntryWithContent({
        title: "My Article",
        link: "https://example.com/article",
      })

      render(<EntryContent {...defaultProps} entry={entry} />)

      const titleLink = screen.getByRole("link", { name: "My Article" })
      expect(titleLink).toHaveAttribute("href", "https://example.com/article")
    })

    it("title link opens in new tab with noopener", () => {
      const entry = mockEntryWithContent({
        title: "My Article",
        link: "https://example.com/article",
      })

      render(<EntryContent {...defaultProps} entry={entry} />)

      const titleLink = screen.getByRole("link", { name: "My Article" })
      expect(titleLink).toHaveAttribute("target", "_blank")
      expect(titleLink).toHaveAttribute("rel", "noopener noreferrer")
    })

    it("shows feed title", () => {
      const entry = mockEntryWithContent({ feed_title: "Tech Blog" })

      render(<EntryContent {...defaultProps} entry={entry} />)

      expect(screen.getByText("Tech Blog")).toBeInTheDocument()
    })

    it("shows author when present", () => {
      const entry = mockEntryWithContent({ author: "John Doe" })

      render(<EntryContent {...defaultProps} entry={entry} />)

      expect(screen.getByText("John Doe")).toBeInTheDocument()
    })

    it("shows formatted published date", () => {
      const entry = mockEntryWithContent({
        published: "2025-01-15T10:30:00Z",
      })

      render(<EntryContent {...defaultProps} entry={entry} />)

      // Should contain date parts - the exact format depends on locale
      const timeElement = screen.getByRole("time")
      expect(timeElement).toHaveAttribute(
        "datetime",
        "2025-01-15T10:30:00Z"
      )
    })

    it("renders labels with correct colors", () => {
      const entry = mockEntryWithContent({
        labels: [
          { id: 1, caption: "Important", fg_color: "#ffffff", bg_color: "#ff0000" },
        ],
      })

      render(<EntryContent {...defaultProps} entry={entry} />)

      const badge = screen.getByText("Important")
      expect(badge).toHaveStyle({
        backgroundColor: "#ff0000",
        color: "#ffffff",
      })
    })

    it("renders tags as badges", () => {
      const entry = mockEntryWithContent({
        tags: ["tech", "news"],
      })

      render(<EntryContent {...defaultProps} entry={entry} />)

      expect(screen.getByText("tech")).toBeInTheDocument()
      expect(screen.getByText("news")).toBeInTheDocument()
    })

    it("renders HTML content", () => {
      const entry = mockEntryWithContent({
        content: "<p>This is <strong>bold</strong> content.</p>",
      })

      render(<EntryContent {...defaultProps} entry={entry} />)

      expect(screen.getByText(/This is/)).toBeInTheDocument()
      expect(screen.getByText("bold")).toBeInTheDocument()
    })

    it("shows note section when entry has note", () => {
      const entry = mockEntryWithContent({
        note: "My personal notes about this article",
      })

      render(<EntryContent {...defaultProps} entry={entry} />)

      expect(screen.getByText("Note")).toBeInTheDocument()
      expect(
        screen.getByText("My personal notes about this article")
      ).toBeInTheDocument()
    })
  })

  describe("image stripping", () => {
    it("strips images when strip_images preference is true", () => {
      mockPreferences.strip_images = "true"
      const entry = mockEntryWithContent({
        content: '<p>Text</p><img src="image.jpg" alt="test"/><p>More</p>',
      })

      render(<EntryContent {...defaultProps} entry={entry} />)

      // Image should not be in the document
      expect(screen.queryByRole("img")).not.toBeInTheDocument()
      expect(screen.getByText("Text")).toBeInTheDocument()
      expect(screen.getByText("More")).toBeInTheDocument()
    })

    it("keeps images when preference is false", () => {
      mockPreferences.strip_images = "false"
      const entry = mockEntryWithContent({
        content: '<p>Text</p><img src="image.jpg" alt="test image"/><p>More</p>',
      })

      render(<EntryContent {...defaultProps} entry={entry} />)

      // Image should be in the document
      expect(screen.getByRole("img")).toBeInTheDocument()
    })
  })

  describe("interactions", () => {
    it("previous button calls onPrevious", async () => {
      const user = userEvent.setup()
      const onPrevious = vi.fn()
      const entry = mockEntryWithContent()

      render(
        <EntryContent
          {...defaultProps}
          entry={entry}
          onPrevious={onPrevious}
        />
      )

      const buttons = screen.getAllByRole("button")
      await user.click(buttons[0]) // First button is previous

      expect(onPrevious).toHaveBeenCalledOnce()
    })

    it("next button calls onNext", async () => {
      const user = userEvent.setup()
      const onNext = vi.fn()
      const entry = mockEntryWithContent()

      render(
        <EntryContent {...defaultProps} entry={entry} onNext={onNext} />
      )

      const buttons = screen.getAllByRole("button")
      await user.click(buttons[1]) // Second button is next

      expect(onNext).toHaveBeenCalledOnce()
    })

    it("read toggle calls onToggleRead", async () => {
      const user = userEvent.setup()
      const onToggleRead = vi.fn()
      const entry = mockEntryWithContent()

      render(
        <EntryContent
          {...defaultProps}
          entry={entry}
          onToggleRead={onToggleRead}
        />
      )

      // Find the button with Circle icon
      const buttons = screen.getAllByRole("button")
      const readButton = buttons.find((btn) =>
        btn.querySelector("svg.lucide-circle")
      )

      if (readButton) {
        await user.click(readButton)
        expect(onToggleRead).toHaveBeenCalledOnce()
      }
    })

    it("star toggle calls onToggleStarred", async () => {
      const user = userEvent.setup()
      const onToggleStarred = vi.fn()
      const entry = mockEntryWithContent()

      render(
        <EntryContent
          {...defaultProps}
          entry={entry}
          onToggleStarred={onToggleStarred}
        />
      )

      // Find the button with Star icon
      const buttons = screen.getAllByRole("button")
      const starButton = buttons.find((btn) =>
        btn.querySelector("svg.lucide-star")
      )

      if (starButton) {
        await user.click(starButton)
        expect(onToggleStarred).toHaveBeenCalledOnce()
      }
    })
  })

  describe("edge cases", () => {
    it("handles missing author", () => {
      const entry = mockEntryWithContent({ author: "" })

      render(<EntryContent {...defaultProps} entry={entry} />)

      // Should still render without error
      expect(screen.getByText(entry.title)).toBeInTheDocument()
    })

    it("handles empty labels array", () => {
      const entry = mockEntryWithContent({ labels: [] })

      render(<EntryContent {...defaultProps} entry={entry} />)

      // Should render without labels section causing issues
      expect(screen.getByText(entry.title)).toBeInTheDocument()
    })

    it("handles empty tags array", () => {
      const entry = mockEntryWithContent({ tags: [] })

      render(<EntryContent {...defaultProps} entry={entry} />)

      // Should render without tags section causing issues
      expect(screen.getByText(entry.title)).toBeInTheDocument()
    })

    it("handles entry with no content", () => {
      const entry = mockEntryWithContent({ content: "" })

      render(<EntryContent {...defaultProps} entry={entry} />)

      // Should still show title and header
      expect(screen.getByText(entry.title)).toBeInTheDocument()
    })

    it("renders enclosures when present", () => {
      const entry = mockEntryWithContent({
        enclosures: [
          {
            id: 1,
            content_url: "https://example.com/audio.mp3",
            content_type: "audio/mpeg",
            title: "Podcast",
            duration: "30:00",
            width: 0,
            height: 0,
          },
        ],
      })

      render(<EntryContent {...defaultProps} entry={entry} />)

      expect(screen.getByTestId("enclosure-player")).toBeInTheDocument()
      expect(screen.getByText("1 enclosures")).toBeInTheDocument()
    })
  })
})
