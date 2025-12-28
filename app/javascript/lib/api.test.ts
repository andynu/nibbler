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
    it("returns parsed feed data", async () => {
      const feeds = [mockFeed(), mockFeed({ id: 2, title: "Feed 2" })]
      mockFetch.mockResolvedValue(jsonResponse(feeds))

      const result = await api.feeds.list()

      expect(result).toEqual(feeds)
      expect(result).toHaveLength(2)
    })
  })

  describe("create", () => {
    it("returns the created feed", async () => {
      const newFeed = mockFeed({ id: 5, title: "New Feed" })
      mockFetch.mockResolvedValue(jsonResponse(newFeed))

      const result = await api.feeds.create({
        feed: { feed_url: "https://example.com/feed.xml" },
      })

      expect(result.id).toBe(5)
      expect(result.title).toBe("New Feed")
    })
  })

  describe("delete", () => {
    it("handles 204 No Content response", async () => {
      mockFetch.mockResolvedValue(noContentResponse())

      // Should not throw
      await api.feeds.delete(1)
    })
  })
})

describe("api.entries", () => {
  describe("list", () => {
    it("returns paginated entries", async () => {
      const paginated = mockPaginatedEntries([mockEntry(), mockEntry({ id: 2 })], {
        page: 1,
        per_page: 50,
        total: 2,
        total_pages: 1,
      })
      mockFetch.mockResolvedValue(jsonResponse(paginated))

      const result = await api.entries.list()

      expect(result.entries).toHaveLength(2)
      expect(result.pagination.total).toBe(2)
    })

    it("builds query string with multiple filters", async () => {
      const paginated = mockPaginatedEntries()
      mockFetch.mockResolvedValue(jsonResponse(paginated))

      await api.entries.list({ unread: true, feed_id: 5, page: 2 })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain("unread=true")
      expect(url).toContain("feed_id=5")
      expect(url).toContain("page=2")
    })
  })

  describe("get", () => {
    it("returns entry with full content", async () => {
      const entry = mockEntryWithContent({ content: "<p>Full article content</p>" })
      mockFetch.mockResolvedValue(jsonResponse(entry))

      const result = await api.entries.get(1)

      expect(result.content).toBe("<p>Full article content</p>")
    })
  })

  describe("toggleRead", () => {
    it("returns updated read status", async () => {
      const response = { id: 1, unread: false }
      mockFetch.mockResolvedValue(jsonResponse(response))

      const result = await api.entries.toggleRead(1)

      expect(result.id).toBe(1)
      expect(result.unread).toBe(false)
    })
  })

  describe("toggleStarred", () => {
    it("returns updated starred status", async () => {
      const response = { id: 1, starred: true }
      mockFetch.mockResolvedValue(jsonResponse(response))

      const result = await api.entries.toggleStarred(1)

      expect(result.id).toBe(1)
      expect(result.starred).toBe(true)
    })
  })
})

describe("api.categories", () => {
  describe("list", () => {
    it("returns flat category list", async () => {
      const categories = [mockCategory(), mockCategory({ id: 2, title: "Cat 2" })]
      mockFetch.mockResolvedValue(jsonResponse(categories))

      const result = await api.categories.list()

      expect(result).toHaveLength(2)
    })
  })

  describe("tree", () => {
    it("returns nested category structure", async () => {
      const tree = [mockCategory({ children: [mockCategory({ id: 2 })] })]
      mockFetch.mockResolvedValue(jsonResponse(tree))

      const result = await api.categories.tree()

      expect(result[0].children).toHaveLength(1)
    })
  })
})

describe("api.preferences", () => {
  describe("get", () => {
    it("returns user preferences", async () => {
      const prefs = mockPreferences({ theme: "dark" })
      mockFetch.mockResolvedValue(jsonResponse(prefs))

      const result = await api.preferences.get()

      expect(result.theme).toBe("dark")
    })
  })

  describe("update", () => {
    it("returns updated preferences", async () => {
      const prefs = mockPreferences({ theme: "light" })
      mockFetch.mockResolvedValue(jsonResponse(prefs))

      const result = await api.preferences.update({ theme: "light" })

      expect(result.theme).toBe("light")
    })
  })
})

describe("api.filters", () => {
  describe("list", () => {
    it("returns filter list", async () => {
      const filters = [mockFilter(), mockFilter({ id: 2, title: "Filter 2" })]
      mockFetch.mockResolvedValue(jsonResponse(filters))

      const result = await api.filters.list()

      expect(result).toHaveLength(2)
    })
  })

  describe("test", () => {
    it("returns match results", async () => {
      const testResult = {
        total_tested: 100,
        matches: 5,
        matched_articles: [{ id: 1, title: "Match 1" }],
      }
      mockFetch.mockResolvedValue(jsonResponse(testResult))

      const result = await api.filters.test(1)

      expect(result.total_tested).toBe(100)
      expect(result.matches).toBe(5)
      expect(result.matched_articles).toHaveLength(1)
    })
  })
})

describe("api.tags", () => {
  describe("list", () => {
    it("returns tag names array", async () => {
      const tagsResponse = { tags: ["news", "tech", "sports"] }
      mockFetch.mockResolvedValue(jsonResponse(tagsResponse))

      const result = await api.tags.list()

      expect(result.tags).toHaveLength(3)
      expect(result.tags).toContain("tech")
    })
  })
})

describe("api.entryTags", () => {
  describe("add", () => {
    it("returns updated tags list", async () => {
      const response = { entry_id: 1, tags: ["existing", "new"] }
      mockFetch.mockResolvedValue(jsonResponse(response))

      const result = await api.entryTags.add(1, "new")

      expect(result.entry_id).toBe(1)
      expect(result.tags).toContain("new")
    })
  })

  describe("addMultiple", () => {
    it("adds multiple tags at once", async () => {
      const response = { entry_id: 1, tags: ["tag1", "tag2", "tag3"] }
      mockFetch.mockResolvedValue(jsonResponse(response))

      const result = await api.entryTags.addMultiple(1, ["tag1", "tag2", "tag3"])

      expect(result.tags).toHaveLength(3)
    })
  })

  describe("remove", () => {
    it("returns updated tags list without removed tag", async () => {
      const response = { entry_id: 1, tags: ["remaining"] }
      mockFetch.mockResolvedValue(jsonResponse(response))

      const result = await api.entryTags.remove(1, "removed")

      expect(result.tags).not.toContain("removed")
    })
  })
})

describe("api.labels", () => {
  describe("list", () => {
    it("returns label list", async () => {
      const labels = [mockLabel(), mockLabel({ id: 2, caption: "Urgent" })]
      mockFetch.mockResolvedValue(jsonResponse(labels))

      const result = await api.labels.list()

      expect(result).toHaveLength(2)
    })
  })

  describe("create", () => {
    it("returns created label with colors", async () => {
      const label = mockLabel({ fg_color: "#000", bg_color: "#fff" })
      mockFetch.mockResolvedValue(jsonResponse(label))

      const result = await api.labels.create({
        label: { caption: "Styled", fg_color: "#000", bg_color: "#fff" },
      })

      expect(result.fg_color).toBe("#000")
      expect(result.bg_color).toBe("#fff")
    })
  })
})

describe("api.opml", () => {
  describe("exportUrl", () => {
    it("returns the export URL path", () => {
      const url = api.opml.exportUrl()
      expect(url).toBe("/api/v1/opml/export")
    })
  })

  describe("preview", () => {
    it("returns preview data from file upload", async () => {
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

      expect(result.total).toBe(1)
      expect(result.feeds[0].title).toBe("Test Feed")
    })
  })

  describe("import", () => {
    it("returns import results", async () => {
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

      expect(result.success).toBe(true)
      expect(result.feeds_created).toBe(5)
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
