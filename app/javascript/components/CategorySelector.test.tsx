import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { CategorySelector } from "./CategorySelector"
import { mockCategory } from "../../../test/fixtures/data"

describe("CategorySelector", () => {
  const parentCategory = mockCategory({ id: 1, title: "Parent", parent_id: null })
  const childCategory = mockCategory({ id: 2, title: "Child", parent_id: 1 })
  const siblingCategory = mockCategory({ id: 3, title: "Sibling", parent_id: null })
  const categories = [parentCategory, childCategory, siblingCategory]

  const defaultProps = {
    categories: [],
    selectedCategoryId: null,
    onSelect: vi.fn(),
  }

  describe("rendering", () => {
    it("renders a combobox button", () => {
      render(<CategorySelector {...defaultProps} />)

      expect(screen.getByRole("combobox")).toBeInTheDocument()
    })

    it("shows placeholder when no category selected", () => {
      render(<CategorySelector {...defaultProps} placeholder="Select a category" />)

      expect(screen.getByText("Select a category")).toBeInTheDocument()
    })

    it("shows selected category path", () => {
      render(
        <CategorySelector
          {...defaultProps}
          categories={categories}
          selectedCategoryId={childCategory.id}
        />
      )

      expect(screen.getByText("Parent / Child")).toBeInTheDocument()
    })
  })

  describe("opening popover", () => {
    it("opens category list when clicked", async () => {
      const user = userEvent.setup()

      render(<CategorySelector {...defaultProps} categories={categories} />)

      await user.click(screen.getByRole("combobox"))

      expect(screen.getByPlaceholderText("Search categories...")).toBeInTheDocument()
    })

    it("shows 'No category' option", async () => {
      const user = userEvent.setup()

      render(<CategorySelector {...defaultProps} categories={categories} />)

      await user.click(screen.getByRole("combobox"))

      expect(screen.getByText("No category")).toBeInTheDocument()
    })

    it("lists all categories", async () => {
      const user = userEvent.setup()

      render(<CategorySelector {...defaultProps} categories={categories} />)

      await user.click(screen.getByRole("combobox"))

      expect(screen.getByText("Parent")).toBeInTheDocument()
      expect(screen.getByText("Child")).toBeInTheDocument()
      expect(screen.getByText("Sibling")).toBeInTheDocument()
    })
  })

  describe("filtering", () => {
    it("filters categories when typing", async () => {
      const user = userEvent.setup()

      render(<CategorySelector {...defaultProps} categories={categories} />)

      await user.click(screen.getByRole("combobox"))
      await user.type(screen.getByPlaceholderText("Search categories..."), "Chi")

      // Child should still be visible
      expect(screen.getByText("Child")).toBeInTheDocument()
      // Parent should be visible as part of the path
      expect(screen.queryByText("Sibling")).not.toBeInTheDocument()
    })

    it("shows empty message when no matches", async () => {
      const user = userEvent.setup()

      render(<CategorySelector {...defaultProps} categories={categories} />)

      await user.click(screen.getByRole("combobox"))
      await user.type(screen.getByPlaceholderText("Search categories..."), "xyz")

      // The 'No category' option is always visible, so filtering returns all false
      // but the No Category group remains. Let's check the category list is filtered.
      expect(screen.queryByText("Parent")).not.toBeInTheDocument()
      expect(screen.queryByText("Child")).not.toBeInTheDocument()
      expect(screen.queryByText("Sibling")).not.toBeInTheDocument()
    })
  })

  describe("selection", () => {
    it("calls onSelect when category clicked", async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()

      render(
        <CategorySelector {...defaultProps} categories={categories} onSelect={onSelect} />
      )

      await user.click(screen.getByRole("combobox"))
      await user.click(screen.getByText("Parent"))

      expect(onSelect).toHaveBeenCalledWith(parentCategory.id)
    })

    it("calls onSelect with null when 'No category' clicked", async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()

      render(
        <CategorySelector
          {...defaultProps}
          categories={categories}
          selectedCategoryId={parentCategory.id}
          onSelect={onSelect}
        />
      )

      await user.click(screen.getByRole("combobox"))
      await user.click(screen.getByText("No category"))

      expect(onSelect).toHaveBeenCalledWith(null)
    })

    it("closes popover after selection", async () => {
      const user = userEvent.setup()

      render(<CategorySelector {...defaultProps} categories={categories} />)

      await user.click(screen.getByRole("combobox"))
      await user.click(screen.getByText("Parent"))

      await waitFor(() => {
        expect(screen.queryByPlaceholderText("Search categories...")).not.toBeInTheDocument()
      })
    })
  })

  describe("hierarchy display", () => {
    it("shows path for child categories", async () => {
      const user = userEvent.setup()

      render(<CategorySelector {...defaultProps} categories={categories} />)

      await user.click(screen.getByRole("combobox"))

      // Child should show parent path
      const childItem = screen.getByText("Child").closest<HTMLElement>("[cmdk-item]")
      expect(childItem).toBeInTheDocument()
      expect(within(childItem!).getByText(/Parent/)).toBeInTheDocument()
    })
  })

  describe("category indentation stops at a ceiling", () => {
    // happy-dom keeps the style attribute, so the indent the component
    // computed is observable here even though nothing is laid out.
    const CHAIN_DEPTH = 12

    function chainOfCategories(depth: number) {
      return Array.from({ length: depth + 1 }, (_, level) =>
        mockCategory({
          id: level + 1,
          title: `Level ${level}`,
          parent_id: level === 0 ? null : level,
        })
      )
    }

    /** The inline inset on the element wrapping a row's icon, path and title. */
    function indentOf(title: string) {
      const titleElement = screen.getByText(title, { exact: true })
      return (titleElement.parentElement as HTMLElement).style.paddingLeft
    }

    it("stops widening a deep row's indent past the ceiling", async () => {
      const user = userEvent.setup()
      render(
        <CategorySelector
          {...defaultProps}
          categories={chainOfCategories(CHAIN_DEPTH)}
        />
      )

      await user.click(screen.getByRole("combobox"))

      expect(indentOf("Level 0")).toBe("0px")
      expect(indentOf("Level 1")).toBe("12px")
      expect(indentOf("Level 2")).toBe("24px")
      expect(indentOf("Level 3")).toBe("36px")
      expect(indentOf("Level 4")).toBe("36px")
      expect(indentOf("Level 8")).toBe("36px")
      expect(indentOf("Level 12")).toBe("36px")
    })
  })
})
