import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FeedInfoDialog } from "./FeedInfoDialog"
import { api } from "@/lib/api"
import type { Feed, FeedInfo, Filter } from "@/lib/api"

vi.mock("@/lib/api", () => ({
  api: {
    feeds: {
      info: vi.fn(),
    },
    filters: {
      list: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

const mockFeed: Feed = {
  id: 1,
  title: "Test Feed",
  feed_url: "https://example.com/feed.xml",
  site_url: "https://example.com",
  category_id: null,
  category_title: null,
  icon_url: null,
  last_updated: "2024-01-15T12:00:00Z",
  last_successful_update: "2024-01-15T12:00:00Z",
  next_poll_at: "2024-01-15T13:00:00Z",
  last_error: null,
  unread_count: 5,
  entry_count: 100,
  oldest_entry_date: "2024-01-01T00:00:00Z",
  newest_entry_date: "2024-01-15T11:00:00Z",
}

const mockFeedInfo: FeedInfo = {
  id: 1,
  title: "Test Feed",
  feed_url: "https://example.com/feed.xml",
  site_url: "https://example.com",
  icon_url: null,
  category_title: null,
  last_updated: "2024-01-15T12:00:00Z",
  last_successful_update: "2024-01-15T12:00:00Z",
  next_poll_at: "2024-01-15T13:00:00Z",
  etag: null,
  last_modified: null,
  last_error: null,
  update_interval: null,
  calculated_interval_seconds: 3600,
  avg_posts_per_day: 2.5,
  entry_count: 100,
  oldest_entry_date: "2024-01-01T00:00:00Z",
  newest_entry_date: "2024-01-15T11:00:00Z",
  posts_per_day: 2.5,
  frequency_by_hour: {},
  frequency_by_day: { 0: 10, 1: 15, 2: 12, 3: 8, 4: 20, 5: 18, 6: 5 },
  top_words: [
    { word: "python", count: 25 },
    { word: "javascript", count: 20 },
    { word: "react", count: 15 },
  ],
}

describe("FeedInfoDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("word frequency section", () => {
    it("displays common topics when available", async () => {
      vi.mocked(api.feeds.info).mockResolvedValue(mockFeedInfo)
      vi.mocked(api.filters.list).mockResolvedValue([])

      render(
        <FeedInfoDialog open={true} onOpenChange={() => {}} feed={mockFeed} />
      )

      await waitFor(() => {
        expect(screen.getByText("Common Topics")).toBeInTheDocument()
      })

      expect(screen.getByRole("button", { name: /python/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /javascript/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /react/i })).toBeInTheDocument()
    })

    it("shows helper text about clicking words", async () => {
      vi.mocked(api.feeds.info).mockResolvedValue(mockFeedInfo)
      vi.mocked(api.filters.list).mockResolvedValue([])

      render(
        <FeedInfoDialog open={true} onOpenChange={() => {}} feed={mockFeed} />
      )

      await waitFor(() => {
        expect(screen.getByText(/click a word to create a tagging filter/i)).toBeInTheDocument()
      })
    })

    it("creates a filter when clicking an unhighlighted word", async () => {
      const user = userEvent.setup()
      vi.mocked(api.feeds.info).mockResolvedValue(mockFeedInfo)
      vi.mocked(api.filters.list).mockResolvedValue([])
      vi.mocked(api.filters.create).mockResolvedValue({
        id: 10,
        title: "Tag: python",
        enabled: true,
        match_any_rule: false,
        inverse: false,
        order_id: 0,
        last_triggered: null,
        rules: [
          {
            id: 1,
            filter_type: 3,
            filter_type_name: "both",
            reg_exp: "\\bpython\\b",
            inverse: false,
            feed_id: null,
            category_id: null,
            cat_filter: false,
            match_on: null,
          },
        ],
        actions: [
          {
            id: 1,
            action_type: 4,
            action_type_name: "tag",
            action_param: "python",
          },
        ],
      })

      render(
        <FeedInfoDialog open={true} onOpenChange={() => {}} feed={mockFeed} />
      )

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /python/i })).toBeInTheDocument()
      })

      const pythonButton = screen.getByRole("button", { name: /python/i })
      await user.click(pythonButton)

      await waitFor(() => {
        expect(api.filters.create).toHaveBeenCalledWith({
          filter: expect.objectContaining({
            title: "Tag: python",
            enabled: true,
            filter_rules_attributes: expect.arrayContaining([
              expect.objectContaining({
                filter_type: 3,
                reg_exp: "\\bpython\\b",
              }),
            ]),
            filter_actions_attributes: expect.arrayContaining([
              expect.objectContaining({
                action_type: 4,
                action_param: "python",
              }),
            ]),
          }),
        })
      })
    })

    it("highlights words that have existing filters", async () => {
      vi.mocked(api.feeds.info).mockResolvedValue(mockFeedInfo)
      vi.mocked(api.filters.list).mockResolvedValue([
        {
          id: 10,
          title: "Tag: python",
          enabled: true,
          match_any_rule: false,
          inverse: false,
          order_id: 0,
          last_triggered: null,
          rules: [
            {
              id: 1,
              filter_type: 3,
              filter_type_name: "both",
              reg_exp: "\\bpython\\b",
              inverse: false,
              feed_id: null,
              category_id: null,
              cat_filter: false,
              match_on: null,
            },
          ],
          actions: [
            {
              id: 1,
              action_type: 4,
              action_type_name: "tag",
              action_param: "python",
            },
          ],
        },
      ])

      render(
        <FeedInfoDialog open={true} onOpenChange={() => {}} feed={mockFeed} />
      )

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /python/i })).toBeInTheDocument()
      })

      const pythonButton = screen.getByRole("button", { name: /python/i })
      // The highlighted word should have primary background color
      expect(pythonButton).toHaveClass("bg-primary")

      const jsButton = screen.getByRole("button", { name: /javascript/i })
      // Unhighlighted word should have muted background
      expect(jsButton).toHaveClass("bg-muted")
    })

    it("removes filter when clicking a highlighted word", async () => {
      const user = userEvent.setup()
      vi.mocked(api.feeds.info).mockResolvedValue(mockFeedInfo)
      vi.mocked(api.filters.list).mockResolvedValue([
        {
          id: 10,
          title: "Tag: python",
          enabled: true,
          match_any_rule: false,
          inverse: false,
          order_id: 0,
          last_triggered: null,
          rules: [
            {
              id: 1,
              filter_type: 3,
              filter_type_name: "both",
              reg_exp: "\\bpython\\b",
              inverse: false,
              feed_id: null,
              category_id: null,
              cat_filter: false,
              match_on: null,
            },
          ],
          actions: [
            {
              id: 1,
              action_type: 4,
              action_type_name: "tag",
              action_param: "python",
            },
          ],
        },
      ])
      vi.mocked(api.filters.delete).mockResolvedValue()

      render(
        <FeedInfoDialog open={true} onOpenChange={() => {}} feed={mockFeed} />
      )

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /python/i })).toBeInTheDocument()
      })

      const pythonButton = screen.getByRole("button", { name: /python/i })
      await user.click(pythonButton)

      await waitFor(() => {
        expect(api.filters.delete).toHaveBeenCalledWith(10)
      })
    })
  })

  describe("loading state", () => {
    it("shows loading message initially", async () => {
      vi.mocked(api.feeds.info).mockReturnValue(new Promise(() => {})) // Never resolves
      vi.mocked(api.filters.list).mockReturnValue(new Promise(() => {}))

      render(
        <FeedInfoDialog open={true} onOpenChange={() => {}} feed={mockFeed} />
      )

      expect(screen.getByText("Loading...")).toBeInTheDocument()
    })
  })

  describe("error state", () => {
    it("shows error message when loading fails", async () => {
      vi.mocked(api.feeds.info).mockRejectedValue(new Error("Network error"))
      vi.mocked(api.filters.list).mockResolvedValue([])

      render(
        <FeedInfoDialog open={true} onOpenChange={() => {}} feed={mockFeed} />
      )

      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument()
      })
    })
  })
})
