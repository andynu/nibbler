import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
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
})
