import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { api } from "./api"
import {
  mockFeed,
  mockEntry,
  mockEntryWithContent,
  mockCategory,
  mockLabel,
  mockFilter,
  mockPreferences,
  mockPaginatedEntries,
} from "../../../test/fixtures/data"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Helper to create a successful JSON response
function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  } as Response
}

// Helper to create a 204 No Content response
function noContentResponse(): Response {
  return {
    ok: true,
    status: 204,
    json: () => Promise.reject(new Error("No content")),
  } as Response
}

// Helper to create an error response
function errorResponse(error: string, status = 400): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error }),
  } as Response
}

// Helper to create an error response with no JSON body
function errorResponseNoBody(status = 500): Response {
  return {
    ok: false,
    status,
    json: () => Promise.reject(new Error("No JSON")),
  } as Response
}

describe("api.feeds", () => {
  describe("list", () => {
    it("fetches feeds from GET /feeds", async () => {
      const feeds = [mockFeed(), mockFeed({ id: 2, title: "Feed 2" })]
      mockFetch.mockResolvedValue(jsonResponse(feeds))

      const result = await api.feeds.list()

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/feeds", {
        headers: { "Content-Type": "application/json" },
      })
      expect(result).toEqual(feeds)
    })
  })

  describe("get", () => {
    it("fetches a single feed from GET /feeds/:id", async () => {
      const feed = { ...mockFeed(), entries: [mockEntry()] }
      mockFetch.mockResolvedValue(jsonResponse(feed))

      const result = await api.feeds.get(1)

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/feeds/1", {
        headers: { "Content-Type": "application/json" },
      })
      expect(result).toEqual(feed)
    })
  })

  describe("create", () => {
    it("creates a feed with POST /feeds", async () => {
      const newFeed = mockFeed()
      mockFetch.mockResolvedValue(jsonResponse(newFeed))

      const result = await api.feeds.create({
        feed: { feed_url: "https://example.com/feed.xml" },
      })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/feeds", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ feed: { feed_url: "https://example.com/feed.xml" } }),
      })
      expect(result).toEqual(newFeed)
    })

    it("creates a feed with title and category", async () => {
      const newFeed = mockFeed({ title: "Custom Title", category_id: 5 })
      mockFetch.mockResolvedValue(jsonResponse(newFeed))

      await api.feeds.create({
        feed: {
          title: "Custom Title",
          feed_url: "https://example.com/feed.xml",
          category_id: 5,
        },
      })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/feeds", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({
          feed: {
            title: "Custom Title",
            feed_url: "https://example.com/feed.xml",
            category_id: 5,
          },
        }),
      })
    })
  })

  describe("preview", () => {
    it("previews a feed with POST /feeds/preview", async () => {
      const previewResult = {
        title: "Test Feed",
        site_url: "https://example.com",
        feed_url: "https://example.com/feed.xml",
        entry_count: 10,
        last_updated: "2025-12-27T12:00:00Z",
        sample_entries: [{ title: "First Post", published: "2025-12-27" }],
      }
      mockFetch.mockResolvedValue(jsonResponse(previewResult))

      const result = await api.feeds.preview("https://example.com/feed.xml")

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/feeds/preview", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/feed.xml" }),
      })
      expect(result).toEqual(previewResult)
    })
  })

  describe("feeds update", () => {
    it("updates a feed with PATCH /feeds/:id", async () => {
      const updatedFeed = mockFeed({ title: "Updated Title" })
      mockFetch.mockResolvedValue(jsonResponse(updatedFeed))

      const result = await api.feeds.update(1, {
        feed: { title: "Updated Title" },
      })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/feeds/1", {
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
        body: JSON.stringify({ feed: { title: "Updated Title" } }),
      })
      expect(result).toEqual(updatedFeed)
    })
  })

  describe("delete", () => {
    it("deletes a feed with DELETE /feeds/:id", async () => {
      mockFetch.mockResolvedValue(noContentResponse())

      await api.feeds.delete(1)

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/feeds/1", {
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      })
    })
  })

  describe("refresh", () => {
    it("refreshes a feed with POST /feeds/:id/refresh", async () => {
      const refreshResult = {
        status: "success",
        new_entries: 5,
        feed: mockFeed(),
      }
      mockFetch.mockResolvedValue(jsonResponse(refreshResult))

      const result = await api.feeds.refresh(1)

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/feeds/1/refresh", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      expect(result).toEqual(refreshResult)
    })
  })

  describe("refreshAll", () => {
    it("refreshes all feeds with POST /feeds/refresh_all", async () => {
      const refreshResult = {
        updated: 3,
        results: [
          { feed_id: 1, title: "Feed 1", status: "success", new_entries: 2, error: null },
          { feed_id: 2, title: "Feed 2", status: "success", new_entries: 3, error: null },
        ],
      }
      mockFetch.mockResolvedValue(jsonResponse(refreshResult))

      const result = await api.feeds.refreshAll()

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/feeds/refresh_all", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      expect(result).toEqual(refreshResult)
    })
  })
})

describe("api.entries", () => {
  describe("list", () => {
    it("fetches entries with no params", async () => {
      const paginated = mockPaginatedEntries()
      mockFetch.mockResolvedValue(jsonResponse(paginated))

      const result = await api.entries.list()

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/entries", {
        headers: { "Content-Type": "application/json" },
      })
      expect(result).toEqual(paginated)
    })

    it("fetches entries with unread filter", async () => {
      const paginated = mockPaginatedEntries()
      mockFetch.mockResolvedValue(jsonResponse(paginated))

      await api.entries.list({ unread: true })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/entries?unread=true", {
        headers: { "Content-Type": "application/json" },
      })
    })

    it("fetches entries with feed_id filter", async () => {
      const paginated = mockPaginatedEntries()
      mockFetch.mockResolvedValue(jsonResponse(paginated))

      await api.entries.list({ feed_id: 5 })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/entries?feed_id=5", {
        headers: { "Content-Type": "application/json" },
      })
    })

    it("fetches entries with category_id filter", async () => {
      const paginated = mockPaginatedEntries()
      mockFetch.mockResolvedValue(jsonResponse(paginated))

      await api.entries.list({ category_id: 3 })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/entries?category_id=3", {
        headers: { "Content-Type": "application/json" },
      })
    })

    it("fetches entries with view filter", async () => {
      const paginated = mockPaginatedEntries()
      mockFetch.mockResolvedValue(jsonResponse(paginated))

      await api.entries.list({ view: "fresh" })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/entries?view=fresh", {
        headers: { "Content-Type": "application/json" },
      })
    })

    it("fetches entries with pagination", async () => {
      const paginated = mockPaginatedEntries([], { page: 2, per_page: 25 })
      mockFetch.mockResolvedValue(jsonResponse(paginated))

      await api.entries.list({ page: 2, per_page: 25 })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/entries?page=2&per_page=25", {
        headers: { "Content-Type": "application/json" },
      })
    })

    it("combines multiple filters", async () => {
      const paginated = mockPaginatedEntries()
      mockFetch.mockResolvedValue(jsonResponse(paginated))

      await api.entries.list({ unread: true, feed_id: 5, page: 1 })

      const call = mockFetch.mock.calls[0][0] as string
      expect(call).toContain("unread=true")
      expect(call).toContain("feed_id=5")
      expect(call).toContain("page=1")
    })
  })

  describe("get", () => {
    it("fetches a single entry from GET /entries/:id", async () => {
      const entry = mockEntryWithContent()
      mockFetch.mockResolvedValue(jsonResponse(entry))

      const result = await api.entries.get(1)

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/entries/1", {
        headers: { "Content-Type": "application/json" },
      })
      expect(result).toEqual(entry)
    })
  })

  describe("update", () => {
    it("updates an entry with PATCH /entries/:id", async () => {
      const entry = mockEntry({ unread: false })
      mockFetch.mockResolvedValue(jsonResponse(entry))

      const result = await api.entries.update(1, { entry: { unread: false } })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/entries/1", {
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
        body: JSON.stringify({ entry: { unread: false } }),
      })
      expect(result).toEqual(entry)
    })
  })

  describe("toggleRead", () => {
    it("toggles read status with POST /entries/:id/toggle_read", async () => {
      const response = { id: 1, unread: false }
      mockFetch.mockResolvedValue(jsonResponse(response))

      const result = await api.entries.toggleRead(1)

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/entries/1/toggle_read", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      expect(result).toEqual(response)
    })
  })

  describe("toggleStarred", () => {
    it("toggles starred status with POST /entries/:id/toggle_starred", async () => {
      const response = { id: 1, starred: true }
      mockFetch.mockResolvedValue(jsonResponse(response))

      const result = await api.entries.toggleStarred(1)

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/entries/1/toggle_starred", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      expect(result).toEqual(response)
    })
  })

  describe("markAllRead", () => {
    it("marks all entries as read with no params", async () => {
      const response = { marked_read: 50 }
      mockFetch.mockResolvedValue(jsonResponse(response))

      const result = await api.entries.markAllRead()

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/entries/mark_all_read", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: "{}",
      })
      expect(result).toEqual(response)
    })

    it("marks entries as read for a specific feed", async () => {
      const response = { marked_read: 10 }
      mockFetch.mockResolvedValue(jsonResponse(response))

      await api.entries.markAllRead({ feed_id: 5 })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/entries/mark_all_read", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ feed_id: 5 }),
      })
    })

    it("marks entries as read for a specific category", async () => {
      const response = { marked_read: 25 }
      mockFetch.mockResolvedValue(jsonResponse(response))

      await api.entries.markAllRead({ category_id: 3 })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/entries/mark_all_read", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ category_id: 3 }),
      })
    })
  })
})

describe("api.categories", () => {
  describe("list", () => {
    it("fetches categories from GET /categories", async () => {
      const categories = [mockCategory(), mockCategory({ id: 2, title: "Cat 2" })]
      mockFetch.mockResolvedValue(jsonResponse(categories))

      const result = await api.categories.list()

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/categories", {
        headers: { "Content-Type": "application/json" },
      })
      expect(result).toEqual(categories)
    })
  })

  describe("tree", () => {
    it("fetches category tree from GET /categories/tree", async () => {
      const tree = [mockCategory({ children: [mockCategory({ id: 2 })] })]
      mockFetch.mockResolvedValue(jsonResponse(tree))

      const result = await api.categories.tree()

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/categories/tree", {
        headers: { "Content-Type": "application/json" },
      })
      expect(result).toEqual(tree)
    })
  })

  describe("get", () => {
    it("fetches a single category from GET /categories/:id", async () => {
      const category = mockCategory()
      mockFetch.mockResolvedValue(jsonResponse(category))

      const result = await api.categories.get(1)

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/categories/1", {
        headers: { "Content-Type": "application/json" },
      })
      expect(result).toEqual(category)
    })
  })

  describe("create", () => {
    it("creates a category with POST /categories", async () => {
      const category = mockCategory({ title: "New Category" })
      mockFetch.mockResolvedValue(jsonResponse(category))

      const result = await api.categories.create({
        category: { title: "New Category" },
      })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/categories", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ category: { title: "New Category" } }),
      })
      expect(result).toEqual(category)
    })

    it("creates a nested category with parent_id", async () => {
      const category = mockCategory({ title: "Child", parent_id: 1 })
      mockFetch.mockResolvedValue(jsonResponse(category))

      await api.categories.create({
        category: { title: "Child", parent_id: 1 },
      })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/categories", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ category: { title: "Child", parent_id: 1 } }),
      })
    })
  })

  describe("update", () => {
    it("updates a category with PATCH /categories/:id", async () => {
      const category = mockCategory({ title: "Updated" })
      mockFetch.mockResolvedValue(jsonResponse(category))

      const result = await api.categories.update(1, {
        category: { title: "Updated" },
      })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/categories/1", {
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
        body: JSON.stringify({ category: { title: "Updated" } }),
      })
      expect(result).toEqual(category)
    })
  })

  describe("delete", () => {
    it("deletes a category with DELETE /categories/:id", async () => {
      mockFetch.mockResolvedValue(noContentResponse())

      await api.categories.delete(1)

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/categories/1", {
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      })
    })
  })
})

describe("api.preferences", () => {
  describe("get", () => {
    it("fetches preferences from GET /preferences", async () => {
      const prefs = mockPreferences()
      mockFetch.mockResolvedValue(jsonResponse(prefs))

      const result = await api.preferences.get()

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/preferences", {
        headers: { "Content-Type": "application/json" },
      })
      expect(result).toEqual(prefs)
    })
  })

  describe("update", () => {
    it("updates preferences with PATCH /preferences", async () => {
      const prefs = mockPreferences({ theme: "dark" })
      mockFetch.mockResolvedValue(jsonResponse(prefs))

      const result = await api.preferences.update({ theme: "dark" })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/preferences", {
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
        body: JSON.stringify({ theme: "dark" }),
      })
      expect(result).toEqual(prefs)
    })
  })
})

describe("api.filters", () => {
  describe("list", () => {
    it("fetches filters from GET /filters", async () => {
      const filters = [mockFilter(), mockFilter({ id: 2, title: "Filter 2" })]
      mockFetch.mockResolvedValue(jsonResponse(filters))

      const result = await api.filters.list()

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/filters", {
        headers: { "Content-Type": "application/json" },
      })
      expect(result).toEqual(filters)
    })
  })

  describe("get", () => {
    it("fetches a single filter from GET /filters/:id", async () => {
      const filter = mockFilter()
      mockFetch.mockResolvedValue(jsonResponse(filter))

      const result = await api.filters.get(1)

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/filters/1", {
        headers: { "Content-Type": "application/json" },
      })
      expect(result).toEqual(filter)
    })
  })

  describe("create", () => {
    it("creates a filter with POST /filters", async () => {
      const filter = mockFilter()
      mockFetch.mockResolvedValue(jsonResponse(filter))

      const result = await api.filters.create({
        filter: { title: "New Filter" },
      })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/filters", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ filter: { title: "New Filter" } }),
      })
      expect(result).toEqual(filter)
    })
  })

  describe("update", () => {
    it("updates a filter with PATCH /filters/:id", async () => {
      const filter = mockFilter({ enabled: false })
      mockFetch.mockResolvedValue(jsonResponse(filter))

      const result = await api.filters.update(1, {
        filter: { enabled: false },
      })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/filters/1", {
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
        body: JSON.stringify({ filter: { enabled: false } }),
      })
      expect(result).toEqual(filter)
    })
  })

  describe("delete", () => {
    it("deletes a filter with DELETE /filters/:id", async () => {
      mockFetch.mockResolvedValue(noContentResponse())

      await api.filters.delete(1)

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/filters/1", {
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      })
    })
  })

  describe("test", () => {
    it("tests a filter with POST /filters/:id/test", async () => {
      const testResult = {
        total_tested: 100,
        matches: 5,
        matched_articles: [{ id: 1, title: "Match 1" }],
      }
      mockFetch.mockResolvedValue(jsonResponse(testResult))

      const result = await api.filters.test(1)

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/filters/1/test", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      expect(result).toEqual(testResult)
    })
  })
})

describe("api.tags", () => {
  describe("list", () => {
    it("fetches tags from GET /tags", async () => {
      const tagsResponse = { tags: ["news", "tech", "sports"] }
      mockFetch.mockResolvedValue(jsonResponse(tagsResponse))

      const result = await api.tags.list()

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/tags", {
        headers: { "Content-Type": "application/json" },
      })
      expect(result).toEqual(tagsResponse)
    })
  })
})

describe("api.labels", () => {
  describe("list", () => {
    it("fetches labels from GET /labels", async () => {
      const labels = [mockLabel(), mockLabel({ id: 2, caption: "Urgent" })]
      mockFetch.mockResolvedValue(jsonResponse(labels))

      const result = await api.labels.list()

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/labels", {
        headers: { "Content-Type": "application/json" },
      })
      expect(result).toEqual(labels)
    })
  })

  describe("get", () => {
    it("fetches a single label from GET /labels/:id", async () => {
      const label = mockLabel()
      mockFetch.mockResolvedValue(jsonResponse(label))

      const result = await api.labels.get(1)

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/labels/1", {
        headers: { "Content-Type": "application/json" },
      })
      expect(result).toEqual(label)
    })
  })

  describe("create", () => {
    it("creates a label with POST /labels", async () => {
      const label = mockLabel({ caption: "New Label" })
      mockFetch.mockResolvedValue(jsonResponse(label))

      const result = await api.labels.create({
        label: { caption: "New Label" },
      })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/labels", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ label: { caption: "New Label" } }),
      })
      expect(result).toEqual(label)
    })

    it("creates a label with colors", async () => {
      const label = mockLabel({ fg_color: "#000", bg_color: "#fff" })
      mockFetch.mockResolvedValue(jsonResponse(label))

      await api.labels.create({
        label: { caption: "Styled", fg_color: "#000", bg_color: "#fff" },
      })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/labels", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({
          label: { caption: "Styled", fg_color: "#000", bg_color: "#fff" },
        }),
      })
    })
  })

  describe("update", () => {
    it("updates a label with PATCH /labels/:id", async () => {
      const label = mockLabel({ caption: "Updated" })
      mockFetch.mockResolvedValue(jsonResponse(label))

      const result = await api.labels.update(1, {
        label: { caption: "Updated" },
      })

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/labels/1", {
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
        body: JSON.stringify({ label: { caption: "Updated" } }),
      })
      expect(result).toEqual(label)
    })
  })

  describe("delete", () => {
    it("deletes a label with DELETE /labels/:id", async () => {
      mockFetch.mockResolvedValue(noContentResponse())

      await api.labels.delete(1)

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/labels/1", {
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      })
    })
  })
})

describe("api.entryLabels", () => {
  describe("add", () => {
    it("adds a label to an entry with POST /entries/:id/labels", async () => {
      mockFetch.mockResolvedValue(noContentResponse())

      await api.entryLabels.add(1, 5)

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/entries/1/labels", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ label_id: 5 }),
      })
    })
  })

  describe("remove", () => {
    it("removes a label from an entry with DELETE /entries/:id/labels/:labelId", async () => {
      mockFetch.mockResolvedValue(noContentResponse())

      await api.entryLabels.remove(1, 5)

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/entries/1/labels/5", {
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      })
    })
  })
})

describe("api.opml", () => {
  describe("exportUrl", () => {
    it("returns the export URL", () => {
      const url = api.opml.exportUrl()
      expect(url).toBe("/api/v1/opml/export")
    })
  })

  describe("preview", () => {
    it("sends file as FormData to POST /opml/preview", async () => {
      const previewResult = {
        feeds: [
          {
            title: "Test Feed",
            feed_url: "https://example.com/feed.xml",
            site_url: "https://example.com",
            category_path: "Tech",
            exists: false,
          },
        ],
        total: 1,
        new_feeds: 1,
        existing_feeds: 0,
        errors: [],
      }
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(previewResult),
      } as Response)

      const file = new File(["<opml>...</opml>"], "feeds.opml", {
        type: "text/xml",
      })
      const result = await api.opml.preview(file)

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/opml/preview", {
        method: "POST",
        body: expect.any(FormData),
      })
      expect(result).toEqual(previewResult)
    })
  })

  describe("import", () => {
    it("sends file as FormData to POST /opml/import", async () => {
      const importResult = {
        success: true,
        summary: "Imported 5 feeds",
        feeds_created: 5,
        feeds_skipped: 2,
        categories_created: 3,
      }
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(importResult),
      } as Response)

      const file = new File(["<opml>...</opml>"], "feeds.opml", {
        type: "text/xml",
      })
      const result = await api.opml.import(file)

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/opml/import", {
        method: "POST",
        body: expect.any(FormData),
      })
      expect(result).toEqual(importResult)
    })
  })
})

describe("error handling", () => {
  it("throws Error with message from response body", async () => {
    mockFetch.mockResolvedValue(errorResponse("Feed URL is invalid"))

    await expect(api.feeds.create({ feed: { feed_url: "invalid" } })).rejects.toThrow(
      "Feed URL is invalid"
    )
  })

  it("throws Error with HTTP status when no error message in body", async () => {
    mockFetch.mockResolvedValue(errorResponseNoBody(500))

    await expect(api.feeds.list()).rejects.toThrow("HTTP 500")
  })

  it("handles 404 errors", async () => {
    mockFetch.mockResolvedValue(errorResponse("Feed not found", 404))

    await expect(api.feeds.get(999)).rejects.toThrow("Feed not found")
  })

  it("handles 401 unauthorized errors", async () => {
    mockFetch.mockResolvedValue(errorResponse("Not authenticated", 401))

    await expect(api.entries.list()).rejects.toThrow("Not authenticated")
  })

  it("handles 422 validation errors", async () => {
    mockFetch.mockResolvedValue(
      errorResponse("Title can't be blank", 422)
    )

    await expect(
      api.categories.create({ category: { title: "" } })
    ).rejects.toThrow("Title can't be blank")
  })
})
