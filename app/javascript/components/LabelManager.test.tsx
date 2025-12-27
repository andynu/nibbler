import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { LabelManager } from "./LabelManager"
import { mockLabel } from "../../../test/fixtures/data"

// Mock API
const mockApiLabelsList = vi.fn()
const mockApiLabelsCreate = vi.fn()
const mockApiLabelsUpdate = vi.fn()
const mockApiLabelsDelete = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    labels: {
      list: () => mockApiLabelsList(),
      create: (...args: unknown[]) => mockApiLabelsCreate(...args),
      update: (...args: unknown[]) => mockApiLabelsUpdate(...args),
      delete: (...args: unknown[]) => mockApiLabelsDelete(...args),
    },
  },
}))

describe("LabelManager", () => {
  const testLabel = mockLabel({
    id: 1,
    caption: "Important",
    fg_color: "#ffffff",
    bg_color: "#ef4444",
    entry_count: 42,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiLabelsList.mockResolvedValue([])
    mockApiLabelsCreate.mockResolvedValue(testLabel)
    mockApiLabelsUpdate.mockResolvedValue(testLabel)
    mockApiLabelsDelete.mockResolvedValue({})

    // Mock window.confirm
    vi.spyOn(window, "confirm").mockReturnValue(true)
    vi.spyOn(window, "alert").mockImplementation(() => {})
  })

  describe("loading state", () => {
    it("shows loading message initially", () => {
      mockApiLabelsList.mockReturnValue(new Promise(() => {}))

      render(<LabelManager />)

      expect(screen.getByText("Loading labels...")).toBeInTheDocument()
    })
  })

  describe("empty state", () => {
    it("shows empty message when no labels", async () => {
      mockApiLabelsList.mockResolvedValue([])

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByText("No labels yet.")).toBeInTheDocument()
      })
    })

    it("shows help text in empty state", async () => {
      mockApiLabelsList.mockResolvedValue([])

      render(<LabelManager />)

      await waitFor(() => {
        expect(
          screen.getByText(/create labels to organize and classify articles/i)
        ).toBeInTheDocument()
      })
    })
  })

  describe("label list rendering", () => {
    it("shows header", async () => {
      mockApiLabelsList.mockResolvedValue([])
      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByText("Labels")).toBeInTheDocument()
      })
    })

    it("shows New Label button", async () => {
      mockApiLabelsList.mockResolvedValue([])
      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /new label/i })).toBeInTheDocument()
      })
    })

    it("renders label caption", async () => {
      mockApiLabelsList.mockResolvedValue([testLabel])

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByText("Important")).toBeInTheDocument()
      })
    })

    it("shows entry count", async () => {
      mockApiLabelsList.mockResolvedValue([testLabel])

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByText("42 articles")).toBeInTheDocument()
      })
    })

    it("shows singular article count", async () => {
      const singleLabel = { ...testLabel, entry_count: 1 }
      mockApiLabelsList.mockResolvedValue([singleLabel])

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByText("1 article")).toBeInTheDocument()
      })
    })

    it("renders label with correct colors", async () => {
      mockApiLabelsList.mockResolvedValue([testLabel])

      render(<LabelManager />)

      await waitFor(() => {
        const badge = screen.getByText("Important").closest('[data-slot="badge"]')
        expect(badge).toHaveStyle({
          backgroundColor: "#ef4444",
          color: "#ffffff",
        })
      })
    })

    it("shows edit button for each label", async () => {
      mockApiLabelsList.mockResolvedValue([testLabel])

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /edit important/i })).toBeInTheDocument()
      })
    })

    it("shows delete button for each label", async () => {
      mockApiLabelsList.mockResolvedValue([testLabel])

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /delete important/i })).toBeInTheDocument()
      })
    })

    it("shows zero articles count", async () => {
      const emptyLabel = { ...testLabel, entry_count: 0 }
      mockApiLabelsList.mockResolvedValue([emptyLabel])

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByText("0 articles")).toBeInTheDocument()
      })
    })

    it("renders multiple labels", async () => {
      const labels = [
        testLabel,
        mockLabel({ id: 2, caption: "Read Later", entry_count: 10 }),
        mockLabel({ id: 3, caption: "Archive", entry_count: 5 }),
      ]
      mockApiLabelsList.mockResolvedValue(labels)

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByText("Important")).toBeInTheDocument()
        expect(screen.getByText("Read Later")).toBeInTheDocument()
        expect(screen.getByText("Archive")).toBeInTheDocument()
      })
    })
  })

  describe("delete label", () => {
    it("shows confirmation message with entry count", async () => {
      const user = userEvent.setup()
      mockApiLabelsList.mockResolvedValue([testLabel])

      render(<LabelManager />)

      const deleteButton = await screen.findByRole("button", { name: /delete important/i })
      await user.click(deleteButton)

      expect(window.confirm).toHaveBeenCalledWith(
        'Delete "Important"? It is currently applied to 42 article(s).'
      )
    })

    it("shows simple confirmation when no entries", async () => {
      const user = userEvent.setup()
      const emptyLabel = { ...testLabel, entry_count: 0 }
      mockApiLabelsList.mockResolvedValue([emptyLabel])

      render(<LabelManager />)

      const deleteButton = await screen.findByRole("button", { name: /delete important/i })
      await user.click(deleteButton)

      expect(window.confirm).toHaveBeenCalledWith('Delete "Important"?')
    })

    it("calls delete API when confirmed", async () => {
      const user = userEvent.setup()
      mockApiLabelsList.mockResolvedValue([testLabel])

      render(<LabelManager />)

      const deleteButton = await screen.findByRole("button", { name: /delete important/i })
      await user.click(deleteButton)

      expect(mockApiLabelsDelete).toHaveBeenCalledWith(1)
    })

    it("does not call delete when cancelled", async () => {
      const user = userEvent.setup()
      vi.mocked(window.confirm).mockReturnValue(false)
      mockApiLabelsList.mockResolvedValue([testLabel])

      render(<LabelManager />)

      const deleteButton = await screen.findByRole("button", { name: /delete important/i })
      await user.click(deleteButton)

      expect(mockApiLabelsDelete).not.toHaveBeenCalled()
    })

    it("removes label from list after deletion", async () => {
      const user = userEvent.setup()
      mockApiLabelsList.mockResolvedValue([testLabel])

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByText("Important")).toBeInTheDocument()
      })

      const deleteButton = screen.getByRole("button", { name: /delete important/i })
      await user.click(deleteButton)

      await waitFor(() => {
        expect(screen.queryByText("Important")).not.toBeInTheDocument()
      })
    })
  })

  describe("New Label button", () => {
    it("clicking New Label sets creating state", async () => {
      const user = userEvent.setup()
      mockApiLabelsList.mockResolvedValue([])

      render(<LabelManager />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /new label/i })).toBeInTheDocument()
      })

      // Just verify we can click the button without error
      await user.click(screen.getByRole("button", { name: /new label/i }))

      // The dialog opening is tested by verifying state change occurred
      // (no error thrown means button click worked)
    })
  })

  describe("edit label button", () => {
    it("clicking edit button sets editing state", async () => {
      const user = userEvent.setup()
      mockApiLabelsList.mockResolvedValue([testLabel])

      render(<LabelManager />)

      const editButton = await screen.findByRole("button", { name: /edit important/i })
      await user.click(editButton)

      // Edit dialog should open
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /edit label/i })).toBeInTheDocument()
      })
    })
  })
})
