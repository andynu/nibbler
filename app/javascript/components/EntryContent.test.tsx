import { render, screen, fireEvent, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { EntryContent } from "./EntryContent"
import { mockEntryWithContent } from "../../../test/fixtures/data"

// Mock the API boundary. SuggestedTags fetches entry info on mount and
// FollowStoryDialog extracts queries when opened; without this the relative
// API_BASE resolves against happy-dom's http://localhost:3000 and hits the network.
const mockApiEntriesInfo = vi.fn()
const mockApiStoriesExtractFromEntry = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    entries: {
      info: (...args: unknown[]) => mockApiEntriesInfo(...args),
    },
    stories: {
      extractFromEntry: (...args: unknown[]) =>
        mockApiStoriesExtractFromEntry(...args),
    },
  },
}))

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

// Mock the audio player context
const mockAudioPlayer = {
  state: "idle" as const,
  source: null,
  currentTime: 0,
  duration: 0,
  currentWordIndex: -1,
  timestamps: [],
  error: null,
  autoScroll: true,
  playbackSpeed: 1,
  isVisible: false,
  activeEntryId: null,
  activeEntryTitle: null,
  activeFeedTitle: null,
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn(),
  seek: vi.fn(),
  toggle: vi.fn(),
  toggleAutoScroll: vi.fn(),
  pauseAutoScroll: vi.fn(),
  setPlaybackSpeed: vi.fn(),
  dismiss: vi.fn(),
  requestTtsAudio: vi.fn(),
  requestPodcastAudio: vi.fn(),
  jumpToSource: vi.fn(),
  onJumpToEntry: null,
  setOnJumpToEntry: vi.fn(),
  isActive: false,
}

vi.mock("@/contexts/AudioPlayerContext", () => ({
  useAudioPlayer: () => mockAudioPlayer,
}))

// Mock the layout context
vi.mock("@/contexts/LayoutContext", () => ({
  useLayout: () => ({
    breakpoint: "desktop" as const,
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    currentPane: "content" as const,
    setCurrentPane: vi.fn(),
    goToSidebar: vi.fn(),
    goToList: vi.fn(),
    goToContent: vi.fn(),
    goBack: vi.fn(),
    canGoBack: false,
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
    showIframe: false,
    onToggleIframe: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockPreferences.strip_images = "false"
    mockApiEntriesInfo.mockResolvedValue({ top_words: [] })
    mockApiStoriesExtractFromEntry.mockResolvedValue({
      topic: "",
      queries: [],
      source_entry_id: null,
    })
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

      expect(screen.getByRole("button", { name: /previous entry/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /next entry/i })).toBeInTheDocument()
    })

    it("previous button is disabled when hasPrevious is false", () => {
      const entry = mockEntryWithContent()

      render(
        <EntryContent {...defaultProps} entry={entry} hasPrevious={false} />
      )

      expect(screen.getByRole("button", { name: /previous entry/i })).toBeDisabled()
    })

    it("next button is disabled when hasNext is false", () => {
      const entry = mockEntryWithContent()

      render(<EntryContent {...defaultProps} entry={entry} hasNext={false} />)

      expect(screen.getByRole("button", { name: /next entry/i })).toBeDisabled()
    })

    it("shows read/unread toggle button", () => {
      const entry = mockEntryWithContent({ unread: true })

      render(<EntryContent {...defaultProps} entry={entry} />)

      expect(screen.getByRole("button", { name: /mark as read/i })).toBeInTheDocument()
    })

    it("shows star toggle button", () => {
      const entry = mockEntryWithContent()

      render(<EntryContent {...defaultProps} entry={entry} />)

      expect(screen.getByRole("button", { name: /add star/i })).toBeInTheDocument()
    })

    it("shows external link button", () => {
      const entry = mockEntryWithContent()

      render(<EntryContent {...defaultProps} entry={entry} />)

      expect(screen.getByRole("link", { name: /open in new tab/i })).toBeInTheDocument()
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

    it("renders tags in SuggestedTags component", () => {
      const entry = mockEntryWithContent({
        tags: [
          { id: 1, name: "tech", fg_color: "#ffffff", bg_color: "#64748b" },
          { id: 2, name: "news", fg_color: "#ffffff", bg_color: "#64748b" },
        ],
      })

      render(
        <EntryContent
          {...defaultProps}
          entry={entry}
          allTags={["tech", "news", "other"]}
          onAddTag={vi.fn()}
          onRemoveTag={vi.fn()}
        />
      )

      // Tags appear in the SuggestedTags component
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

      await user.click(screen.getByRole("button", { name: /previous entry/i }))

      expect(onPrevious).toHaveBeenCalledOnce()
    })

    it("next button calls onNext", async () => {
      const user = userEvent.setup()
      const onNext = vi.fn()
      const entry = mockEntryWithContent()

      render(
        <EntryContent {...defaultProps} entry={entry} onNext={onNext} />
      )

      await user.click(screen.getByRole("button", { name: /next entry/i }))

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

      await user.click(screen.getByRole("button", { name: /mark as read/i }))

      expect(onToggleRead).toHaveBeenCalledOnce()
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

      await user.click(screen.getByRole("button", { name: /add star/i }))

      expect(onToggleStarred).toHaveBeenCalledOnce()
    })
  })

  describe("edge cases", () => {
    it("handles missing author", () => {
      const entry = mockEntryWithContent({ author: "" })

      render(<EntryContent {...defaultProps} entry={entry} />)

      // Should still render without error
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

  describe("iframe view keyboard focus", () => {
    /**
     * happy-dom really loads an iframe's src through its own fetch, which
     * globalThis.fetch guard in test/setup.ts cannot intercept. about:blank
     * keeps these examples on the machine while still giving a real frame with
     * real focus semantics.
     */
    const iframeEntry = () => mockEntryWithContent({ link: "about:blank" })

    const restoreButton = () =>
      screen.queryByRole("button", { name: /restore shortcuts/i })

    async function settle() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
      })
    }

    /**
     * The reader's shortcuts live on this document, so they stop firing the
     * moment the embedded document takes focus. A window blur while the frame
     * is the active element is the only signal the browser gives; happy-dom
     * does not blur on its own, so the event is dispatched here.
     *
     * The leading settle drains happy-dom's own asynchronous iframe load, which
     * would otherwise arrive mid-example and spend the guard's first-load
     * reclaim on a handoff the reader never made.
     */
    async function handOffToFrame(frame: HTMLElement) {
      await settle()
      frame.focus()
      fireEvent.blur(window)
      await settle()
    }

    it("renders the original page in an iframe", () => {
      const entry = iframeEntry()

      render(<EntryContent {...defaultProps} entry={entry} showIframe={true} />)

      expect(screen.getByTitle(entry.title)).toHaveAttribute("src", entry.link)
    })

    it("keeps focus in this document so shortcuts keep working", () => {
      const entry = iframeEntry()

      render(<EntryContent {...defaultProps} entry={entry} showIframe={true} />)

      expect(document.activeElement).not.toBe(screen.getByTitle(entry.title))
      expect(restoreButton()).not.toBeInTheDocument()
    })

    it("offers a way back once the embedded page takes keyboard focus", async () => {
      const entry = iframeEntry()

      render(<EntryContent {...defaultProps} entry={entry} showIframe={true} />)
      await handOffToFrame(screen.getByTitle(entry.title))

      expect(restoreButton()).toBeInTheDocument()
    })

    it("leaves previous, next and focus mode clickable during the handoff", async () => {
      const entry = iframeEntry()
      const onNext = vi.fn()
      const onToggleFocusMode = vi.fn()
      const user = userEvent.setup()

      render(
        <EntryContent
          {...defaultProps}
          entry={entry}
          showIframe={true}
          focusMode={true}
          onNext={onNext}
          onToggleFocusMode={onToggleFocusMode}
        />
      )
      await handOffToFrame(screen.getByTitle(entry.title))

      await user.click(screen.getByRole("button", { name: /next entry/i }))
      await user.click(screen.getByRole("button", { name: /exit focus mode/i }))

      expect(onNext).toHaveBeenCalledOnce()
      expect(onToggleFocusMode).toHaveBeenCalledOnce()
    })

    it("returns keyboard control to the reader when asked", async () => {
      const entry = iframeEntry()
      const user = userEvent.setup()

      render(<EntryContent {...defaultProps} entry={entry} showIframe={true} />)
      await handOffToFrame(screen.getByTitle(entry.title))

      await user.click(restoreButton()!)

      expect(document.activeElement).not.toBe(screen.getByTitle(entry.title))
      expect(restoreButton()).not.toBeInTheDocument()
    })

    it("does not offer the affordance in RSS view", async () => {
      const entry = iframeEntry()

      render(<EntryContent {...defaultProps} entry={entry} showIframe={false} />)

      fireEvent.blur(window)
      await settle()

      expect(restoreButton()).not.toBeInTheDocument()
    })
  })
})
