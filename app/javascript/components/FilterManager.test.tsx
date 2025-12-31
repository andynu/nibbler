import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { FilterManager } from "./FilterManager"
import { mockFilter } from "../../../test/fixtures/data"

// Mock API
const mockApiFiltersList = vi.fn()
const mockApiFiltersUpdate = vi.fn()
const mockApiFiltersDelete = vi.fn()
const mockApiFiltersCreate = vi.fn()
const mockApiFiltersTest = vi.fn()
const mockApiTagsList = vi.fn()
const mockApiLabelsList = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    filters: {
      list: () => mockApiFiltersList(),
      update: (...args: unknown[]) => mockApiFiltersUpdate(...args),
      delete: (...args: unknown[]) => mockApiFiltersDelete(...args),
      create: (...args: unknown[]) => mockApiFiltersCreate(...args),
      test: (...args: unknown[]) => mockApiFiltersTest(...args),
    },
    tags: {
      list: () => mockApiTagsList(),
    },
    labels: {
      list: () => mockApiLabelsList(),
    },
  },
}))

describe("FilterManager", () => {
  const defaultProps = {
    feeds: [],
    categories: [],
  }

  const testFilter = mockFilter({
    id: 1,
    title: "Test Filter",
    enabled: true,
    match_any_rule: false,
    inverse: false,
    rules: [
      {
        id: 1,
        filter_type: "title",
        reg_exp: "test.*pattern",
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
        action_type: "mark_read",
        action_param: null,
      },
    ],
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiFiltersList.mockResolvedValue([])
    mockApiTagsList.mockResolvedValue({ tags: [] })
    mockApiLabelsList.mockResolvedValue([])
    mockApiFiltersUpdate.mockResolvedValue(testFilter)
    mockApiFiltersCreate.mockResolvedValue(testFilter)
    mockApiFiltersDelete.mockResolvedValue({})
    mockApiFiltersTest.mockResolvedValue({ matches: 5, total_tested: 100 })

    // Mock window.confirm
    vi.spyOn(window, "confirm").mockReturnValue(true)
    vi.spyOn(window, "alert").mockImplementation(() => {})
  })

  describe("loading state", () => {
    it("shows loading message initially", () => {
      // Don't resolve the promise to keep loading
      mockApiFiltersList.mockReturnValue(new Promise(() => {}))

      render(<FilterManager {...defaultProps} />)

      expect(screen.getByText("Loading filters...")).toBeInTheDocument()
    })
  })

  describe("empty state", () => {
    it("shows empty message when no filters", async () => {
      mockApiFiltersList.mockResolvedValue([])

      render(<FilterManager {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText("No filters yet.")).toBeInTheDocument()
      })
    })

    it("shows help text in empty state", async () => {
      mockApiFiltersList.mockResolvedValue([])

      render(<FilterManager {...defaultProps} />)

      await waitFor(() => {
        expect(
          screen.getByText(/create filters to automatically process incoming articles/i)
        ).toBeInTheDocument()
      })
    })
  })

  describe("filter list rendering", () => {
    it("shows header", async () => {
      render(<FilterManager {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText("Article Filters")).toBeInTheDocument()
      })
    })

    it("shows New Filter button", async () => {
      render(<FilterManager {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /new filter/i })).toBeInTheDocument()
      })
    })

    it("renders filter title", async () => {
      mockApiFiltersList.mockResolvedValue([testFilter])

      render(<FilterManager {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText("Test Filter")).toBeInTheDocument()
      })
    })

    it("shows enabled/disabled toggle", async () => {
      mockApiFiltersList.mockResolvedValue([testFilter])

      render(<FilterManager {...defaultProps} />)

      await waitFor(() => {
        const toggle = screen.getByRole("switch")
        expect(toggle).toBeInTheDocument()
        expect(toggle).toBeChecked()
      })
    })

    it("shows Disabled badge when filter is disabled", async () => {
      const disabledFilter = { ...testFilter, enabled: false }
      mockApiFiltersList.mockResolvedValue([disabledFilter])

      render(<FilterManager {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText("Disabled")).toBeInTheDocument()
      })
    })

    it("shows rule summary", async () => {
      mockApiFiltersList.mockResolvedValue([testFilter])

      render(<FilterManager {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText(/title ~ "test\.\*pattern"/i)).toBeInTheDocument()
      })
    })

    it("shows action badges", async () => {
      mockApiFiltersList.mockResolvedValue([testFilter])

      render(<FilterManager {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText("Mark as read")).toBeInTheDocument()
      })
    })

    it("shows last triggered date when present", async () => {
      const filterWithLastTriggered = {
        ...testFilter,
        last_triggered: "2025-01-15T10:00:00Z",
      }
      mockApiFiltersList.mockResolvedValue([filterWithLastTriggered])

      render(<FilterManager {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText(/last triggered:/i)).toBeInTheDocument()
      })
    })

    it("shows edit button for each filter", async () => {
      mockApiFiltersList.mockResolvedValue([testFilter])

      render(<FilterManager {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /edit test filter/i })).toBeInTheDocument()
      })
    })

    it("shows delete button for each filter", async () => {
      mockApiFiltersList.mockResolvedValue([testFilter])

      render(<FilterManager {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /delete test filter/i })).toBeInTheDocument()
      })
    })

    it("shows test button for each filter", async () => {
      mockApiFiltersList.mockResolvedValue([testFilter])

      render(<FilterManager {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /test test filter/i })).toBeInTheDocument()
      })
    })
  })

  describe("toggle enabled/disabled", () => {
    it("toggles filter enabled state", async () => {
      const user = userEvent.setup()
      mockApiFiltersList.mockResolvedValue([testFilter])
      mockApiFiltersUpdate.mockResolvedValue({ ...testFilter, enabled: false })

      render(<FilterManager {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeInTheDocument()
      })

      await user.click(screen.getByRole("switch"))

      expect(mockApiFiltersUpdate).toHaveBeenCalledWith(1, {
        filter: { enabled: false },
      })
    })
  })

  describe("test filter", () => {
    it("clicking test button calls API", async () => {
      const user = userEvent.setup()
      mockApiFiltersList.mockResolvedValue([testFilter])

      render(<FilterManager {...defaultProps} />)

      const testButton = await screen.findByRole("button", { name: /test test filter/i })
      await user.click(testButton)

      expect(mockApiFiltersTest).toHaveBeenCalledWith(1)
    })

    it("shows test results", async () => {
      const user = userEvent.setup()
      mockApiFiltersList.mockResolvedValue([testFilter])
      mockApiFiltersTest.mockResolvedValue({ matches: 5, total_tested: 100 })

      render(<FilterManager {...defaultProps} />)

      const testButton = await screen.findByRole("button", { name: /test test filter/i })
      await user.click(testButton)

      await waitFor(() => {
        expect(screen.getByText("5/100 matched")).toBeInTheDocument()
      })
    })
  })

  describe("delete filter", () => {
    it("shows confirmation before deleting", async () => {
      const user = userEvent.setup()
      mockApiFiltersList.mockResolvedValue([testFilter])

      render(<FilterManager {...defaultProps} />)

      const deleteButton = await screen.findByRole("button", { name: /delete test filter/i })
      await user.click(deleteButton)

      expect(window.confirm).toHaveBeenCalledWith(
        "Are you sure you want to delete this filter?"
      )
    })

    it("calls delete API when confirmed", async () => {
      const user = userEvent.setup()
      mockApiFiltersList.mockResolvedValue([testFilter])

      render(<FilterManager {...defaultProps} />)

      const deleteButton = await screen.findByRole("button", { name: /delete test filter/i })
      await user.click(deleteButton)

      expect(mockApiFiltersDelete).toHaveBeenCalledWith(1)
    })

    it("does not call delete when cancelled", async () => {
      const user = userEvent.setup()
      vi.mocked(window.confirm).mockReturnValue(false)
      mockApiFiltersList.mockResolvedValue([testFilter])

      render(<FilterManager {...defaultProps} />)

      const deleteButton = await screen.findByRole("button", { name: /delete test filter/i })
      await user.click(deleteButton)

      expect(mockApiFiltersDelete).not.toHaveBeenCalled()
    })
  })

  describe("New Filter button", () => {
    it("clicking New Filter opens create dialog", async () => {
      const user = userEvent.setup()
      mockApiFiltersList.mockResolvedValue([])

      render(<FilterManager {...defaultProps} />)

      await user.click(await screen.findByRole("button", { name: /new filter/i }))

      // Create dialog should open
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /create filter/i })).toBeInTheDocument()
      })
    })
  })

  describe("edit filter button", () => {
    it("clicking edit button opens edit dialog", async () => {
      const user = userEvent.setup()
      mockApiFiltersList.mockResolvedValue([testFilter])

      render(<FilterManager {...defaultProps} />)

      const editButton = await screen.findByRole("button", { name: /edit test filter/i })
      await user.click(editButton)

      // Edit dialog should open
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /edit filter/i })).toBeInTheDocument()
      })
    })
  })
})
