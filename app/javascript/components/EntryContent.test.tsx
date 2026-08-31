import { render, screen, fireEvent, act, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { EntryContent } from "./EntryContent"
import { SCORE_VALUES } from "./ScoreButtons"
import { mockEntryWithContent } from "../../../test/fixtures/data"

// Mock the API boundary. SuggestedTags fetches entry info on mount and
// FollowStoryDialog extracts queries when opened; without this the relative
// API_BASE resolves against happy-dom's http://localhost:3000 and hits the network.
const mockApiEntriesInfo = vi.fn()
const mockApiEntriesEmbedPolicy = vi.fn()
const mockApiEntriesSummarize = vi.fn()
const mockApiStoriesExtractFromEntry = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    entries: {
      info: (...args: unknown[]) => mockApiEntriesInfo(...args),
      embedPolicy: (...args: unknown[]) => mockApiEntriesEmbedPolicy(...args),
      summarize: (...args: unknown[]) => mockApiEntriesSummarize(...args),
    },
    stories: {
      extractFromEntry: (...args: unknown[]) =>
        mockApiStoriesExtractFromEntry(...args),
    },
  },
}))

// The other boundary the summary crosses. Mocked at the shared consumer rather
// than at useEntrySummary, so these tests drive the real hook and the real
// channel plumbing and the broadcast is the thing under test.
const { getConsumer, cableCreate, cableUnsubscribe } = vi.hoisted(() => {
  const cableUnsubscribe = vi.fn()
  const cableCreate = vi.fn(
    (_channel: unknown, _mixin: unknown) => ({ unsubscribe: cableUnsubscribe })
  )
  return {
    cableCreate,
    cableUnsubscribe,
    getConsumer: vi.fn(() => ({ subscriptions: { create: cableCreate } })),
  }
})

vi.mock("@/lib/cable", () => ({ getConsumer, resetConsumer: vi.fn() }))

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
  // Widened so a test can put TTS playback on this entry, which is the state
  // that used to take the whole action row off screen.
  source: null as string | null,
  currentTime: 0,
  duration: 0,
  currentWordIndex: -1,
  timestamps: [],
  error: null,
  autoScroll: true,
  playbackSpeed: 1,
  isVisible: false,
  activeEntryId: null as number | null,
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
    mockApiEntriesEmbedPolicy.mockResolvedValue({ status: "embeddable", reason: null })
    mockApiEntriesSummarize.mockResolvedValue({ status: "queued" })
    cableCreate.mockClear()
    cableUnsubscribe.mockClear()
    mockAudioPlayer.source = null
    mockAudioPlayer.activeEntryId = null
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

  describe("the reading pane's scrolling region", () => {
    // This sees the mechanism behind ttrb-qgjc but not its consequence. Radix
    // writes `overflow-x` on the viewport as an inline style, from whether a
    // horizontal scrollbar is mounted: `scroll` if one is, `hidden` if none is
    // (@radix-ui/react-scroll-area 1.2.18, dist/index.mjs:121). An inline style
    // needs no layout to read back, so this does fail against the unfixed pane
    // ("expected 'hidden' to be 'scroll'") and is a catcher, not just a
    // deletion guard.
    //
    // What it cannot show is what the reader lost: a table or pre block wider
    // than the pane laying out at full width in a box that refused every
    // gesture. happy-dom loads no stylesheet and lays nothing out, so every box
    // measures zero and every element answers every query regardless of width.
    // e2e/article-wide-content.spec.ts proves that half in real browsers.
    it("leaves the article viewport scrollable in both axes", () => {
      const entry = mockEntryWithContent({
        content: "<p>An article with a body, so the pane renders one.</p>",
      })

      const { container } = render(<EntryContent {...defaultProps} entry={entry} />)

      const viewport = container.querySelector<HTMLElement>(
        '[data-slot="scroll-area-viewport"]'
      )

      expect(viewport).not.toBeNull()
      expect(viewport?.style.overflowX).toBe("scroll")
      expect(viewport?.style.overflowY).toBe("scroll")
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

  // Headline-only and link-only items are a normal RSS shape - 20 of the 50
  // items in a municipal news flash feed carry a title and a link and no body.
  // Nibbler now stores those instead of rejecting them at ingest, so the reader
  // has to say something useful rather than render an empty pane.
  describe("entries with no body", () => {
    it("explains that the feed published no article text", () => {
      const entry = mockEntryWithContent({ content: "" })

      render(<EntryContent {...defaultProps} entry={entry} />)

      expect(
        screen.getByText(/feed published a headline and a link only/i)
      ).toBeInTheDocument()
    })

    it("offers the original page in a new tab", () => {
      const entry = mockEntryWithContent({
        content: "",
        link: "https://braintreema.gov/1375",
      })

      render(<EntryContent {...defaultProps} entry={entry} />)

      const link = screen.getByRole("link", { name: /open the original site/i })
      expect(link).toHaveAttribute("href", "https://braintreema.gov/1375")
      expect(link).toHaveAttribute("rel", "noopener noreferrer")
    })

    it("offers the framed original page", async () => {
      const user = userEvent.setup()
      const onToggleIframe = vi.fn()
      const entry = mockEntryWithContent({ content: "" })

      render(
        <EntryContent
          {...defaultProps}
          entry={entry}
          onToggleIframe={onToggleIframe}
        />
      )

      await user.click(screen.getByRole("button", { name: /read the page here/i }))

      expect(onToggleIframe).toHaveBeenCalled()
    })

    // Whitespace is not a body. A feed that emits "<p> </p>" should get the
    // same treatment as one that emits nothing.
    it("treats a whitespace-only body as no body", () => {
      const entry = mockEntryWithContent({ content: "   \n  " })

      render(<EntryContent {...defaultProps} entry={entry} />)

      expect(
        screen.getByText(/feed published a headline and a link only/i)
      ).toBeInTheDocument()
    })

    it("does not show the empty state when the entry has a body", () => {
      const entry = mockEntryWithContent({ content: "<p>Real article text</p>" })

      render(<EntryContent {...defaultProps} entry={entry} />)

      expect(screen.getByText("Real article text")).toBeInTheDocument()
      expect(
        screen.queryByText(/feed published a headline and a link only/i)
      ).not.toBeInTheDocument()
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

  /**
   * A refused frame fires `load` and never `error`, so the panel below can only
   * appear on the server's reading of the page's headers. See useEmbedPolicy.
   */
  describe("sites that refuse to be framed", () => {
    const iframeEntry = () => mockEntryWithContent({ link: "about:blank" })

    const blockedPanel = () => screen.queryByText("This site blocks embedding")

    it("replaces the blank frame with an explanation and a way out", async () => {
      const entry = iframeEntry()
      mockApiEntriesEmbedPolicy.mockResolvedValue({
        status: "blocked",
        reason: "x-frame-options: deny",
      })

      render(<EntryContent {...defaultProps} entry={entry} showIframe={true} />)

      expect(await screen.findByText("This site blocks embedding")).toBeInTheDocument()
      expect(screen.queryByTitle(entry.title)).not.toBeInTheDocument()

      // The panel carries the refusing header as its tooltip.
      const panel = screen.getByTitle("x-frame-options: deny")
      expect(within(panel).getByRole("link", { name: /open in new tab/i })).toHaveAttribute(
        "href",
        entry.link
      )
    })

    it("keeps the frame for a page that embeds fine", async () => {
      const entry = iframeEntry()

      render(<EntryContent {...defaultProps} entry={entry} showIframe={true} />)

      await act(async () => {
        await Promise.resolve()
      })
      expect(blockedPanel()).not.toBeInTheDocument()
      expect(screen.getByTitle(entry.title)).toBeInTheDocument()
    })

    // The reader's own browser may reach a site the server could not.
    it("keeps the frame when the site could not be asked", async () => {
      const entry = iframeEntry()
      mockApiEntriesEmbedPolicy.mockResolvedValue({
        status: "unknown",
        reason: "Connection timed out",
      })

      render(<EntryContent {...defaultProps} entry={entry} showIframe={true} />)

      await act(async () => {
        await Promise.resolve()
      })
      expect(blockedPanel()).not.toBeInTheDocument()
      expect(screen.getByTitle(entry.title)).toBeInTheDocument()
    })

    it("asks nothing while the feed's own content is on screen", () => {
      render(<EntryContent {...defaultProps} entry={iframeEntry()} showIframe={false} />)

      expect(mockApiEntriesEmbedPolicy).not.toHaveBeenCalled()
    })

    it("goes back to the feed's copy from the panel's own instructions", async () => {
      const entry = iframeEntry()
      mockApiEntriesEmbedPolicy.mockResolvedValue({
        status: "blocked",
        reason: "x-frame-options: deny",
      })

      const { rerender } = render(
        <EntryContent {...defaultProps} entry={entry} showIframe={true} />
      )
      expect(await screen.findByText("This site blocks embedding")).toBeInTheDocument()

      rerender(<EntryContent {...defaultProps} entry={entry} showIframe={false} />)

      expect(blockedPanel()).not.toBeInTheDocument()
      expect(screen.getByText(entry.content!.replace(/<[^>]*>/g, "").trim())).toBeInTheDocument()
    })

    /**
     * The panel used to read "Press i to read the feed's copy instead", which
     * is the one instruction a phone reader cannot follow: no keyboard, and
     * below the xs breakpoint the header's framing toggle is not on screen
     * either (ttrb-tyvd).
     */
    it("offers a tappable way back rather than a keystroke", async () => {
      const user = userEvent.setup()
      const onToggleIframe = vi.fn()
      mockApiEntriesEmbedPolicy.mockResolvedValue({
        status: "blocked",
        reason: "x-frame-options: deny",
      })

      render(
        <EntryContent
          {...defaultProps}
          entry={iframeEntry()}
          showIframe={true}
          onToggleIframe={onToggleIframe}
        />
      )
      const panel = await screen.findByTestId("embed-blocked-fallback")

      await user.click(
        within(panel).getByRole("button", { name: "Show the feed's copy" })
      )

      expect(onToggleIframe).toHaveBeenCalledOnce()
    })

    it("no longer tells a touch reader to press a key", async () => {
      mockApiEntriesEmbedPolicy.mockResolvedValue({
        status: "blocked",
        reason: "x-frame-options: deny",
      })

      render(
        <EntryContent {...defaultProps} entry={iframeEntry()} showIframe={true} />
      )
      await screen.findByTestId("embed-blocked-fallback")

      expect(screen.queryByText(/press i/i)).not.toBeInTheDocument()
    })

    // The shortcut is still worth naming for anyone who has a keyboard; it just
    // cannot be the only route.
    it("keeps the shortcut as a hint on the button", async () => {
      mockApiEntriesEmbedPolicy.mockResolvedValue({
        status: "blocked",
        reason: "x-frame-options: deny",
      })

      render(
        <EntryContent {...defaultProps} entry={iframeEntry()} showIframe={true} />
      )
      const panel = await screen.findByTestId("embed-blocked-fallback")

      expect(
        within(panel).getByRole("button", { name: "Show the feed's copy" })
      ).toHaveAttribute("title", "Show RSS content (i)")
    })
  })

  /**
   * The header sheds the note button, the framing toggle and "Follow this
   * story" below the xs breakpoint and the score control below sm, and until
   * ttrb-tyvd nothing took their place on a phone.
   *
   * What these examples can and cannot show: happy-dom applies no stylesheet,
   * so every one of those buttons is still in this DOM at every width and
   * nothing here proves the menu is *needed*. Reachability at a real 375px is
   * proved in e2e/mobile-article-actions.spec.ts, where the CSS is real. What
   * these cover is the half that browser cannot see cheaply: that the trigger
   * has an accessible name at all, and that each row runs the same handler its
   * header twin runs rather than a copy that can drift.
   */
  describe("actions the header sheds at narrow widths", () => {
    const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(
        screen.getByRole("button", { name: /more article actions/i })
      )
    }

    /**
     * lucide-react puts aria-hidden on its svg when the icon carries no
     * children and no a11y prop, so an icon-only trigger without an explicit
     * label computes an EMPTY accessible name: no screen reader reaches it and
     * neither does this query. Deleting the aria-label in EntryActionsMenu
     * fails every example in this block, starting with this one.
     */
    it("names the overflow trigger", () => {
      render(<EntryContent {...defaultProps} entry={mockEntryWithContent()} />)

      expect(
        screen.getByRole("button", { name: "More article actions" })
      ).toBeInTheDocument()
    })

    it("opens the note editor, the same one the header's note button opens", async () => {
      const user = userEvent.setup()

      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent({ note: "" })}
          onUpdateNote={vi.fn()}
        />
      )

      await openMenu(user)
      await user.click(screen.getByRole("menuitem", { name: "Add note" }))

      expect(
        screen.getByPlaceholderText("Add a note about this article...")
      ).toBeInTheDocument()
    })

    it("names the note row for what it does to an entry that already has one", async () => {
      const user = userEvent.setup()

      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent({ note: "Existing" })}
          onUpdateNote={vi.fn()}
        />
      )

      await openMenu(user)

      expect(screen.getByRole("menuitem", { name: "Edit note" })).toBeInTheDocument()
    })

    it("leaves the note row out when the entry cannot take a note", async () => {
      const user = userEvent.setup()

      render(<EntryContent {...defaultProps} entry={mockEntryWithContent()} />)

      await openMenu(user)

      expect(screen.queryByRole("menuitem", { name: /note/i })).not.toBeInTheDocument()
    })

    it("toggles the framing through the header's own handler", async () => {
      const user = userEvent.setup()
      const onToggleIframe = vi.fn()

      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent()}
          onToggleIframe={onToggleIframe}
        />
      )

      await openMenu(user)
      await user.click(screen.getByRole("menuitem", { name: "Show original page" }))

      expect(onToggleIframe).toHaveBeenCalledOnce()
    })

    it("offers the way back to the feed's copy while the frame is up", async () => {
      const user = userEvent.setup()

      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent({ link: "about:blank" })}
          showIframe={true}
        />
      )

      await openMenu(user)

      expect(
        screen.getByRole("menuitem", { name: "Show RSS content" })
      ).toBeInTheDocument()
    })

    // A phone has no keyboard, so `c` is unreachable there. The row calls the
    // same handler the shortcut calls rather than copying to the clipboard
    // itself, so the two cannot drift apart.
    it("copies the link through the handler the shortcut runs", async () => {
      const user = userEvent.setup()
      const onCopyLink = vi.fn()

      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent()}
          onCopyLink={onCopyLink}
        />
      )

      await openMenu(user)
      await user.click(screen.getByRole("menuitem", { name: "Copy link" }))

      expect(onCopyLink).toHaveBeenCalledOnce()
    })

    it("leaves the copy row out when the parent wires no handler", async () => {
      const user = userEvent.setup()

      render(<EntryContent {...defaultProps} entry={mockEntryWithContent()} />)

      await openMenu(user)

      expect(
        screen.queryByRole("menuitem", { name: "Copy link" })
      ).not.toBeInTheDocument()
    })

    it("opens the follow-story dialog the header's bookmark opens", async () => {
      const user = userEvent.setup()

      render(<EntryContent {...defaultProps} entry={mockEntryWithContent()} />)

      await openMenu(user)
      await user.click(screen.getByRole("menuitem", { name: "Follow this story" }))

      expect(await screen.findByRole("dialog")).toBeInTheDocument()
    })

    it("scores the entry through the header's own handler", async () => {
      const user = userEvent.setup()
      const onScoreChange = vi.fn()

      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent({ score: 0 })}
          onScoreChange={onScoreChange}
        />
      )

      await openMenu(user)
      await user.click(screen.getByRole("menuitemradio", { name: "Score 3" }))

      expect(onScoreChange).toHaveBeenCalledWith(3)
    })

    it("clears the score through the same handler", async () => {
      const user = userEvent.setup()
      const onScoreChange = vi.fn()

      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent({ score: 4 })}
          onScoreChange={onScoreChange}
        />
      )

      await openMenu(user)
      await user.click(screen.getByRole("menuitemradio", { name: "No score" }))

      expect(onScoreChange).toHaveBeenCalledWith(0)
    })

    // A row that never reflects the entry would let the reader re-pick the
    // score it already has and learn nothing from the menu.
    it("marks the score the entry already carries", async () => {
      const user = userEvent.setup()

      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent({ score: 2 })}
          onScoreChange={vi.fn()}
        />
      )

      await openMenu(user)

      expect(screen.getByRole("menuitemradio", { name: "Score 2" })).toBeChecked()
      expect(screen.getByRole("menuitemradio", { name: "Score 5" })).not.toBeChecked()
    })

    // Every value ScoreButtons draws has a row here, so the two cannot end up
    // offering different scales.
    it("offers every value the header's score control offers", async () => {
      const user = userEvent.setup()

      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent()}
          onScoreChange={vi.fn()}
        />
      )

      await openMenu(user)

      for (const n of SCORE_VALUES) {
        expect(
          screen.getByRole("menuitemradio", { name: `Score ${n}` })
        ).toBeInTheDocument()
      }
    })

    it("leaves the score rows out when the entry cannot be scored", async () => {
      const user = userEvent.setup()

      render(<EntryContent {...defaultProps} entry={mockEntryWithContent()} />)

      await openMenu(user)

      expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument()
    })
  })

  describe("focus mode list context", () => {
    const focused = (props: Partial<Parameters<typeof EntryContent>[0]> = {}) =>
      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent()}
          focusMode={true}
          listTitle="Fresh"
          entryIndex={2}
          entryCount={42}
          {...props}
        />
      )

    it("shows the position in the list and the list being walked", () => {
      focused()

      expect(screen.getByText("3 / 42")).toBeInTheDocument()
      expect(screen.getByText("Fresh")).toBeInTheDocument()
    })

    it("reads the same in iframe view, where the list is the only orientation left", () => {
      focused({ entry: mockEntryWithContent({ link: "about:blank" }), showIframe: true })

      expect(screen.getByText("3 / 42")).toBeInTheDocument()
      expect(screen.getByText("Fresh")).toBeInTheDocument()
    })

    it("leaves the header alone outside focus mode, where the list pane says the same thing", () => {
      focused({ focusMode: false })

      expect(screen.queryByText("3 / 42")).not.toBeInTheDocument()
      expect(screen.queryByText("Fresh")).not.toBeInTheDocument()
    })

    it("says nothing about position for an entry that is not in the loaded list", () => {
      focused({ entryIndex: -1 })

      expect(screen.queryByText(/\/ 42/)).not.toBeInTheDocument()
      expect(screen.getByText("Fresh")).toBeInTheDocument()
    })

    it("keeps prev and next clickable as the fallback when the keys are gone", async () => {
      const onPrevious = vi.fn()
      const onNext = vi.fn()
      const user = userEvent.setup()

      focused({ onPrevious, onNext })

      await user.click(screen.getByRole("button", { name: /previous entry/i }))
      await user.click(screen.getByRole("button", { name: /next entry/i }))

      expect(onPrevious).toHaveBeenCalledOnce()
      expect(onNext).toHaveBeenCalledOnce()
    })
  })

  /**
   * The summary control and the segment it opens.
   *
   * These drive the real useEntrySummary and the real useCableSubscription;
   * only the HTTP client and the shared Action Cable consumer are mocked. So a
   * broadcast here goes through the same ordering and merging the browser
   * would, and the assertions are about what the reader ends up seeing. What
   * they are NOT is proof that any of it is visible: happy-dom loads no
   * stylesheet, so every element answers getByRole at every width. Reachability
   * and legibility are e2e/article-summary.spec.ts's, and nothing here proves a
   * real websocket ever delivers a message.
   */
  describe("article summary", () => {
    const PARAGRAPH =
      "Three brokerages will pay ninety million dollars to settle claims about order routing."

    function summaryPayload(overrides: Record<string, unknown> = {}) {
      return {
        summary: PARAGRAPH,
        model: "gemma4:e4b",
        generated_at: "2026-08-30T12:00:00Z",
        stale: false,
        ...overrides,
      }
    }

    /** The mixin the summary subscription was created with. */
    function summaryChannel() {
      const call = cableCreate.mock.calls.find(
        ([channel]) =>
          typeof channel === "object" &&
          channel !== null &&
          (channel as { channel?: string }).channel === "EntrySummaryChannel"
      )
      if (!call) throw new Error("no EntrySummaryChannel subscription was created")
      return call
    }

    /** Deliver one broadcast the way the job would. */
    function broadcast(message: Record<string, unknown>) {
      const mixin = summaryChannel()[1] as { received: (data: unknown) => void }
      act(() => {
        mixin.received(message)
      })
    }

    function summaryButton() {
      return screen.getByRole("button", { name: /summarize this article|show summary|hide summary/i })
    }

    it("offers the control on an article with no summary yet", () => {
      render(<EntryContent {...defaultProps} entry={mockEntryWithContent()} />)

      expect(
        screen.getByRole("button", { name: "Summarize this article" })
      ).toBeInTheDocument()
    })

    // Generation on a shared local model costs real throughput, so the press is
    // the only thing that spends it.
    it("generates nothing until the control is pressed", () => {
      render(<EntryContent {...defaultProps} entry={mockEntryWithContent()} />)

      expect(mockApiEntriesSummarize).not.toHaveBeenCalled()
      expect(screen.queryByTestId("entry-summary-callout")).not.toBeInTheDocument()
    })

    // TWO IDS. The POST is scoped through this user's UserEntry; the channel is
    // keyed on the shared Entry, because the summary hangs off that and one
    // generation serves every reader. The fixture makes them different numbers
    // on purpose -- id 1, entry_id 100 -- so a swap cannot pass.
    it("posts the user_entry id and subscribes on the shared entry id", async () => {
      const user = userEvent.setup()
      const entry = mockEntryWithContent({ id: 7, entry_id: 4242 })

      render(<EntryContent {...defaultProps} entry={entry} />)

      expect(summaryChannel()[0]).toEqual({
        channel: "EntrySummaryChannel",
        entry_id: 4242,
      })

      await user.click(screen.getByRole("button", { name: "Summarize this article" }))

      expect(mockApiEntriesSummarize).toHaveBeenCalledWith(7)
    })

    /**
     * Every EntrySummaryChannel subscription this component has ever opened,
     * in order. `create` is called once per subscribe, so its length is the
     * churn a walk produced.
     */
    function summarySubscribes() {
      return cableCreate.mock.calls.filter(
        ([channel]) =>
          typeof channel === "object" &&
          channel !== null &&
          (channel as { channel?: string }).channel === "EntrySummaryChannel"
      )
    }

    // Measured for ttrb-08ak: a fifty-article walk opens fifty subscriptions
    // and closes forty-nine. That is the intended shape -- one per article, the
    // previous one dropped as the reader moves on -- and it is cheap, but the
    // two ways it could silently stop being one-per-article are worth pinning.
    //
    // This first one guards the ceiling: nothing may open a second subscription
    // for an article the reader is already on.
    it("opens one subscription per article and closes the last on the way out", () => {
      const walk = [4242, 4243, 4244, 4245, 4246]
      const { rerender } = render(
        <EntryContent {...defaultProps} entry={mockEntryWithContent({ id: 1, entry_id: walk[0] })} />
      )

      walk.slice(1).forEach((entryId, index) => {
        rerender(
          <EntryContent
            {...defaultProps}
            entry={mockEntryWithContent({ id: index + 2, entry_id: entryId })}
          />
        )
      })

      expect(summarySubscribes().map(([channel]) => channel)).toEqual(
        walk.map((entry_id) => ({ channel: "EntrySummaryChannel", entry_id }))
      )
      expect(cableUnsubscribe).toHaveBeenCalledTimes(walk.length - 1)
    })

    // The other half of the same guard, and the one with a real way to regress:
    // starring, marking read and saving a note all replace the entry object
    // while the article stays the same (application.tsx spreads a new object
    // into setSelectedEntry). The channel is keyed by value, not by identity,
    // so none of that touches the socket. Passing the channel params in a shape
    // that compares by reference would turn one subscribe per article into one
    // per render, which is the cost this ticket was actually worried about.
    it("does not resubscribe when the same article's row is replaced", () => {
      const entry = mockEntryWithContent({ id: 7, entry_id: 4242 })
      const { rerender } = render(<EntryContent {...defaultProps} entry={entry} />)

      rerender(<EntryContent {...defaultProps} entry={{ ...entry, unread: false }} />)
      rerender(<EntryContent {...defaultProps} entry={{ ...entry, starred: true }} />)
      rerender(<EntryContent {...defaultProps} entry={{ ...entry, note: "kept" }} />)

      expect(summarySubscribes()).toHaveLength(1)
      expect(cableUnsubscribe).not.toHaveBeenCalled()
    })

    // The row this lives in used to disappear wholesale while TTS was playing.
    // Summarizing has nothing to do with audio, and being read to is exactly
    // when a reader might want the paragraph.
    it("keeps the control while TTS is playing this entry", () => {
      const entry = mockEntryWithContent()
      mockAudioPlayer.source = "tts"
      mockAudioPlayer.activeEntryId = entry.id

      render(<EntryContent {...defaultProps} entry={entry} />)

      expect(
        screen.getByRole("button", { name: "Summarize this article" })
      ).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /listen to article/i })).not.toBeInTheDocument()
    })

    it("shows the queued wait, then the running one, then the paragraph", async () => {
      const user = userEvent.setup()
      const entry = mockEntryWithContent()

      render(<EntryContent {...defaultProps} entry={entry} />)
      await user.click(screen.getByRole("button", { name: "Summarize this article" }))

      const callout = () => within(screen.getByTestId("entry-summary-callout"))
      expect(callout().getByText(/has not started on it yet/i)).toBeInTheDocument()

      broadcast({ entry_id: entry.entry_id, state: "running" })
      expect(callout().getByText(/a local model takes a few tens of seconds/i)).toBeInTheDocument()

      broadcast({
        entry_id: entry.entry_id,
        state: "ready",
        summary: summaryPayload(),
      })
      expect(callout().getByText(PARAGRAPH)).toBeInTheDocument()
      expect(callout().getByText(/machine-generated by gemma4:e4b/i)).toBeInTheDocument()
    })

    // The paragraph arrives on the socket. Nothing polls, and the reader takes
    // no second action.
    it("takes the result from the broadcast with no further request", async () => {
      const user = userEvent.setup()
      const entry = mockEntryWithContent()

      render(<EntryContent {...defaultProps} entry={entry} />)
      await user.click(screen.getByRole("button", { name: "Summarize this article" }))
      broadcast({ entry_id: entry.entry_id, state: "ready", summary: summaryPayload() })

      expect(screen.getByText(PARAGRAPH)).toBeInTheDocument()
      expect(mockApiEntriesSummarize).toHaveBeenCalledTimes(1)
    })

    // The summary comes down with the full-content fetch, so re-opening a
    // summarized article costs no request and no model time.
    it("shows a cached summary on open without asking for anything", () => {
      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent({ summary: summaryPayload(), summarizable: true })}
        />
      )

      expect(screen.getByTestId("entry-summary-callout")).toBeInTheDocument()
      expect(screen.getByText(PARAGRAPH)).toBeInTheDocument()
      expect(mockApiEntriesSummarize).not.toHaveBeenCalled()
    })

    it("shows a stale cached summary, marked, with a regenerate control", async () => {
      const user = userEvent.setup()
      const entry = mockEntryWithContent({ summary: summaryPayload({ stale: true }) })

      render(<EntryContent {...defaultProps} entry={entry} />)

      expect(screen.getByText(/earlier version of the article/i)).toBeInTheDocument()

      await user.click(screen.getByRole("button", { name: /regenerate/i }))

      expect(mockApiEntriesSummarize).toHaveBeenCalledWith(entry.id)
      // The old paragraph stays put while its replacement is written; a summary
      // of slightly older text beats a blank space for a triage decision.
      expect(screen.getByText(PARAGRAPH)).toBeInTheDocument()
    })

    it("reports a failure with a retry that asks again", async () => {
      const user = userEvent.setup()
      const entry = mockEntryWithContent()

      render(<EntryContent {...defaultProps} entry={entry} />)
      await user.click(screen.getByRole("button", { name: "Summarize this article" }))
      broadcast({
        entry_id: entry.entry_id,
        state: "failed",
        message: "The summary could not be generated.",
      })

      expect(screen.getByText("The summary could not be generated.")).toBeInTheDocument()

      await user.click(screen.getByRole("button", { name: /try again/i }))
      expect(mockApiEntriesSummarize).toHaveBeenCalledTimes(2)
    })

    it("words a summarizer that is down differently from a failed generation", async () => {
      const user = userEvent.setup()
      const entry = mockEntryWithContent()

      render(<EntryContent {...defaultProps} entry={entry} />)
      await user.click(screen.getByRole("button", { name: "Summarize this article" }))
      broadcast({
        entry_id: entry.entry_id,
        state: "unavailable",
        message: "The summarizer is not responding right now.",
      })

      expect(
        screen.getByText("The summarizer is not responding right now.")
      ).toBeInTheDocument()
    })

    // Andy's call on ttrb-ewz4: below EntrySummarizer::MIN_CONTENT_CHARS the
    // server refuses, so say why rather than offering a control that cannot
    // work or a disabled one with no explanation.
    it("says the feed publishes an excerpt instead of offering the control", () => {
      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent({ summarizable: false })}
        />
      )

      expect(screen.getByText(/this feed publishes an excerpt only/i)).toBeInTheDocument()
      expect(
        screen.queryByRole("button", { name: /summarize this article/i })
      ).not.toBeInTheDocument()
    })

    // A summary written before the article shrank is still worth reaching.
    it("still offers the summary an unsummarizable article already has", () => {
      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent({ summarizable: false, summary: summaryPayload() })}
        />
      )

      expect(screen.getByText(PARAGRAPH)).toBeInTheDocument()
      expect(screen.queryByText(/publishes an excerpt only/i)).not.toBeInTheDocument()
    })

    it("puts the segment away and brings it back without regenerating", async () => {
      const user = userEvent.setup()

      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent({ summary: summaryPayload() })}
        />
      )

      await user.click(screen.getByRole("button", { name: /dismiss summary/i }))
      expect(screen.queryByTestId("entry-summary-callout")).not.toBeInTheDocument()

      await user.click(screen.getByRole("button", { name: "Show summary" }))
      expect(screen.getByText(PARAGRAPH)).toBeInTheDocument()
      expect(mockApiEntriesSummarize).not.toHaveBeenCalled()
    })

    it("hides the segment from the control that opened it", async () => {
      const user = userEvent.setup()

      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent({ summary: summaryPayload() })}
        />
      )

      await user.click(screen.getByRole("button", { name: "Hide summary" }))

      expect(screen.queryByTestId("entry-summary-callout")).not.toBeInTheDocument()
    })

    it("opens the next article's summary even after this one was dismissed", async () => {
      const user = userEvent.setup()
      const { rerender } = render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent({ summary: summaryPayload() })}
        />
      )

      await user.click(screen.getByRole("button", { name: /dismiss summary/i }))

      rerender(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent({
            id: 2,
            entry_id: 200,
            summary: summaryPayload({ summary: "A different paragraph entirely." }),
          })}
        />
      )

      expect(screen.getByText("A different paragraph entirely.")).toBeInTheDocument()
    })

    it("announces the wait and the result in a live region", async () => {
      const user = userEvent.setup()
      const entry = mockEntryWithContent()

      render(<EntryContent {...defaultProps} entry={entry} />)

      const region = screen.getByRole("status")
      expect(region).toHaveTextContent("")

      await user.click(screen.getByRole("button", { name: "Summarize this article" }))
      expect(region).toHaveTextContent("Summary queued.")

      broadcast({ entry_id: entry.entry_id, state: "ready", summary: summaryPayload() })
      expect(region).toHaveTextContent("Summary ready.")
    })

    // The summary is drawn from the feed's copy of the article, which is not
    // what an embedded publisher page shows.
    it("is absent in iframe view", () => {
      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent({ summary: summaryPayload() })}
          showIframe={true}
        />
      )

      expect(screen.queryByTestId("entry-summary-callout")).not.toBeInTheDocument()
      expect(summaryButton).toThrow()
    })
  })

  /**
   * The keyboard half of the copy has no button to relabel the way
   * AccountPanel and ToolsPanel do, so this is the whole of the reader's
   * evidence that `c` did anything (ttrb-rtti).
   *
   * It lives in the toolbar header rather than beside the title because the
   * title is only drawn in the RSS branch: in iframe view the article header
   * does not exist, while the shortcut still works up until focus crosses into
   * the embedded document.
   */
  describe("the copied-link indicator", () => {
    const indicator = () => screen.getByTestId("copy-link-status")

    it("holds a live region open before there is anything to announce", () => {
      render(<EntryContent {...defaultProps} entry={mockEntryWithContent()} />)

      // Mounted and empty, not absent: a live region inserted at the same
      // moment as its text is announced unreliably.
      expect(indicator()).toHaveTextContent("")
      expect(indicator()).toHaveAttribute("aria-live", "polite")
    })

    it("confirms the copy without the reader checking the clipboard", () => {
      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent()}
          copyLinkStatus="copied"
        />
      )

      expect(indicator()).toHaveTextContent("Link copied")
    })

    it("says a failed copy failed, in different words", () => {
      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent()}
          copyLinkStatus="error"
        />
      )

      expect(indicator()).toHaveTextContent("Copy failed")
      expect(indicator()).not.toHaveTextContent("Link copied")
    })

    it("is on screen in iframe view too", () => {
      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent({ link: "about:blank" })}
          showIframe={true}
          copyLinkStatus="copied"
        />
      )

      expect(indicator()).toHaveTextContent("Link copied")
    })
  })

  /**
   * The control a scroll reader reaches at the end of the text (ttrb-fixw).
   *
   * These are wiring guards and nothing more. vitest runs on happy-dom with no
   * stylesheet, so every element here answers getByRole at every width and no
   * assertion below can show that the button is visible, that it sits after the
   * article, or that it is reachable by scrolling on a phone. Those are
   * Playwright's job, at a real viewport: see e2e/end-of-article-nav.spec.ts.
   * What these do prove is which handler the press runs and what is drawn when
   * there is no next article.
   */
  describe("the end-of-article next control", () => {
    const nextButton = () =>
      screen.getByRole("button", { name: /^Next article/ })

    it("names the next article on the button", () => {
      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent()}
          nextEntryTitle="The article that comes after this one"
        />
      )

      expect(nextButton()).toHaveTextContent("The article that comes after this one")
    })

    // lucide-react marks its svg aria-hidden, so a chevron alone would leave
    // this button with an empty accessible name. The text carries it, and it
    // still has to carry it when the parent passed no title.
    it("is still announced when no next title was passed", () => {
      render(<EntryContent {...defaultProps} entry={mockEntryWithContent()} />)

      expect(nextButton()).toBeInTheDocument()
    })

    it("advances by the same handler the swipe and j use", async () => {
      const user = userEvent.setup()
      const onNext = vi.fn()

      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent()}
          onNext={onNext}
          nextEntryTitle="Next up"
        />
      )

      await user.click(nextButton())

      // The prop is application.tsx's handleKeyboardNext, which is what the
      // "next-entry" (j) command is bound to. One call, not two: the press must
      // not also reach the swipe handler on the wrapper.
      expect(onNext).toHaveBeenCalledTimes(1)
    })

    it("offers no dead action at the last article", () => {
      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent()}
          hasNext={false}
        />
      )

      expect(screen.queryByRole("button", { name: /^Next article/ })).not.toBeInTheDocument()
      expect(
        screen.getByText("That was the last article in this list.")
      ).toBeInTheDocument()
    })

    it("is drawn inside the scrolling viewport, below the article", () => {
      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent()}
          nextEntryTitle="Next up"
        />
      )

      const viewport = document.querySelector("[data-slot=scroll-area-viewport]")
      const nav = screen.getByTestId("end-of-article-nav")
      const article = document.querySelector("article")

      // Inside the scroller, so it is reached by scrolling rather than floating
      // over the text, and after the body rather than beside it.
      expect(viewport).toContainElement(nav)
      expect(article).not.toContainElement(nav)
      expect(
        article!.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    })

    // The iframe branch is a different tree with no scroll position Nibbler can
    // read, and the reader is looking at the publisher's own page there.
    it("is absent in iframe view", () => {
      render(
        <EntryContent
          {...defaultProps}
          entry={mockEntryWithContent({ link: "about:blank" })}
          showIframe={true}
          nextEntryTitle="Next up"
        />
      )

      expect(screen.queryByTestId("end-of-article-nav")).not.toBeInTheDocument()
    })

    // Acceptance criterion from ttrb-fixw: confirm the existing reset covers
    // the press rather than reimplementing it. The viewport is shared across
    // entries, so without this the next article opens at the previous one's
    // offset.
    it("leaves the next article scrolled to the top", () => {
      const scrollViewportRef = { current: null as HTMLDivElement | null }
      const first = mockEntryWithContent({ id: 1, title: "First" })
      const second = mockEntryWithContent({ id: 2, entry_id: 200, title: "Second" })

      const { rerender } = render(
        <EntryContent
          {...defaultProps}
          entry={first}
          scrollViewportRef={scrollViewportRef}
        />
      )

      scrollViewportRef.current!.scrollTop = 500

      rerender(
        <EntryContent
          {...defaultProps}
          entry={second}
          scrollViewportRef={scrollViewportRef}
        />
      )

      expect(scrollViewportRef.current!.scrollTop).toBe(0)
    })
  })
})
