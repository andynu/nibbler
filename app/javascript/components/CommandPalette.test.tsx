import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { CommandPalette, useCommandPalette } from "./CommandPalette"
import { mockFeed, mockCategory } from "../../../test/fixtures/data"
import { renderHook, act } from "@testing-library/react"

describe("CommandPalette", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    feeds: [],
    categories: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("closed state", () => {
    it("not visible when open is false", () => {
      render(<CommandPalette {...defaultProps} open={false} />)

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })

  describe("open state", () => {
    it("shows dialog when open is true", () => {
      render(<CommandPalette {...defaultProps} open={true} />)

      expect(screen.getByRole("dialog")).toBeInTheDocument()
    })

    it("shows search input with placeholder", () => {
      render(<CommandPalette {...defaultProps} />)

      const input = screen.getByRole("combobox")
      expect(input).toHaveAttribute("placeholder", "Type a command or search...")
    })

    it("uses custom placeholder when provided", () => {
      render(
        <CommandPalette {...defaultProps} placeholder="Search feeds..." />
      )

      const input = screen.getByRole("combobox")
      expect(input).toHaveAttribute("placeholder", "Search feeds...")
    })

    it("shows empty state when no results", async () => {
      const user = userEvent.setup()
      render(<CommandPalette {...defaultProps} />)

      const input = screen.getByRole("combobox")
      await user.type(input, "nonexistentquery")

      await waitFor(() => {
        expect(screen.getByText("No results found.")).toBeInTheDocument()
      })
    })
  })

  describe("navigation mode", () => {
    it("shows Views group", () => {
      render(
        <CommandPalette
          {...defaultProps}
          mode="navigation"
          onSelectVirtualFeed={vi.fn()}
        />
      )

      expect(screen.getByText("Views")).toBeInTheDocument()
    })

    it("shows Fresh virtual feed", () => {
      render(
        <CommandPalette
          {...defaultProps}
          mode="navigation"
          onSelectVirtualFeed={vi.fn()}
        />
      )

      expect(screen.getByText("Fresh")).toBeInTheDocument()
    })

    it("shows Starred virtual feed", () => {
      render(
        <CommandPalette
          {...defaultProps}
          mode="navigation"
          onSelectVirtualFeed={vi.fn()}
        />
      )

      expect(screen.getByText("Starred")).toBeInTheDocument()
    })

    it("shows Feeds group when feeds provided", () => {
      const feeds = [mockFeed({ id: 1, title: "Tech Blog" })]
      render(<CommandPalette {...defaultProps} feeds={feeds} mode="navigation" />)

      expect(screen.getByText("Feeds")).toBeInTheDocument()
    })

    it("lists all feeds", () => {
      const feeds = [
        mockFeed({ id: 1, title: "Tech Blog" }),
        mockFeed({ id: 2, title: "News Site" }),
      ]
      render(<CommandPalette {...defaultProps} feeds={feeds} mode="navigation" />)

      expect(screen.getByText("Tech Blog")).toBeInTheDocument()
      expect(screen.getByText("News Site")).toBeInTheDocument()
    })

    it("shows feed unread counts", () => {
      const feeds = [mockFeed({ id: 1, title: "Tech Blog", unread_count: 42 })]
      render(<CommandPalette {...defaultProps} feeds={feeds} mode="navigation" />)

      expect(screen.getByText("42")).toBeInTheDocument()
    })

    it("shows Categories group when categories provided", () => {
      const categories = [mockCategory({ id: 1, title: "Tech" })]
      render(
        <CommandPalette {...defaultProps} categories={categories} mode="navigation" />
      )

      expect(screen.getByText("Categories")).toBeInTheDocument()
    })

    it("lists all categories", () => {
      const categories = [
        mockCategory({ id: 1, title: "Tech" }),
        mockCategory({ id: 2, title: "News" }),
      ]
      render(
        <CommandPalette {...defaultProps} categories={categories} mode="navigation" />
      )

      expect(screen.getByText("Tech")).toBeInTheDocument()
      expect(screen.getByText("News")).toBeInTheDocument()
    })

    it("shows category unread counts", () => {
      const categories = [mockCategory({ id: 1, title: "Tech", unread_count: 15 })]
      render(
        <CommandPalette {...defaultProps} categories={categories} mode="navigation" />
      )

      expect(screen.getByText("15")).toBeInTheDocument()
    })
  })

  describe("search/filtering", () => {
    it("filters feeds by title as user types", async () => {
      const user = userEvent.setup()
      const feeds = [
        mockFeed({ id: 1, title: "Tech Blog" }),
        mockFeed({ id: 2, title: "News Site" }),
      ]
      render(<CommandPalette {...defaultProps} feeds={feeds} mode="navigation" />)

      const input = screen.getByRole("combobox")
      await user.type(input, "Tech")

      await waitFor(() => {
        expect(screen.getByText("Tech Blog")).toBeInTheDocument()
        expect(screen.queryByText("News Site")).not.toBeInTheDocument()
      })
    })

    it("filters categories by title", async () => {
      const user = userEvent.setup()
      const categories = [
        mockCategory({ id: 1, title: "Technology" }),
        mockCategory({ id: 2, title: "Sports" }),
      ]
      render(
        <CommandPalette {...defaultProps} categories={categories} mode="navigation" />
      )

      const input = screen.getByRole("combobox")
      await user.type(input, "Tech")

      await waitFor(() => {
        expect(screen.getByText("Technology")).toBeInTheDocument()
        expect(screen.queryByText("Sports")).not.toBeInTheDocument()
      })
    })
  })

  describe("selection actions", () => {
    it("selecting feed calls onSelectFeed", async () => {
      const user = userEvent.setup()
      const onSelectFeed = vi.fn()
      const feeds = [mockFeed({ id: 42, title: "Selected Feed" })]

      render(
        <CommandPalette
          {...defaultProps}
          feeds={feeds}
          mode="navigation"
          onSelectFeed={onSelectFeed}
        />
      )

      await user.click(screen.getByText("Selected Feed"))

      expect(onSelectFeed).toHaveBeenCalledWith(42)
    })

    it("selecting feed closes palette", async () => {
      const user = userEvent.setup()
      const onOpenChange = vi.fn()
      const feeds = [mockFeed({ id: 1, title: "Test Feed" })]

      render(
        <CommandPalette
          {...defaultProps}
          feeds={feeds}
          mode="navigation"
          onOpenChange={onOpenChange}
          onSelectFeed={vi.fn()}
        />
      )

      await user.click(screen.getByText("Test Feed"))

      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it("selecting category calls onSelectCategory", async () => {
      const user = userEvent.setup()
      const onSelectCategory = vi.fn()
      const categories = [mockCategory({ id: 7, title: "Selected Category" })]

      render(
        <CommandPalette
          {...defaultProps}
          categories={categories}
          mode="navigation"
          onSelectCategory={onSelectCategory}
        />
      )

      await user.click(screen.getByText("Selected Category"))

      expect(onSelectCategory).toHaveBeenCalledWith(7)
    })

    it("selecting Fresh calls onSelectVirtualFeed", async () => {
      const user = userEvent.setup()
      const onSelectVirtualFeed = vi.fn()

      render(
        <CommandPalette
          {...defaultProps}
          mode="navigation"
          onSelectVirtualFeed={onSelectVirtualFeed}
        />
      )

      await user.click(screen.getByText("Fresh"))

      expect(onSelectVirtualFeed).toHaveBeenCalledWith("fresh")
    })

    it("selecting Starred calls onSelectVirtualFeed", async () => {
      const user = userEvent.setup()
      const onSelectVirtualFeed = vi.fn()

      render(
        <CommandPalette
          {...defaultProps}
          mode="navigation"
          onSelectVirtualFeed={onSelectVirtualFeed}
        />
      )

      await user.click(screen.getByText("Starred"))

      expect(onSelectVirtualFeed).toHaveBeenCalledWith("starred")
    })
  })

  describe("custom command items", () => {
    it("renders custom items", () => {
      const items = [
        {
          id: "cmd1",
          label: "Custom Command",
          onSelect: vi.fn(),
        },
      ]

      render(<CommandPalette {...defaultProps} items={items} />)

      expect(screen.getByText("Custom Command")).toBeInTheDocument()
    })

    it("groups items by group property", () => {
      const items = [
        {
          id: "cmd1",
          label: "Action 1",
          group: "Actions",
          onSelect: vi.fn(),
        },
        {
          id: "cmd2",
          label: "Action 2",
          group: "Actions",
          onSelect: vi.fn(),
        },
      ]

      render(<CommandPalette {...defaultProps} items={items} />)

      expect(screen.getByText("Actions")).toBeInTheDocument()
      expect(screen.getByText("Action 1")).toBeInTheDocument()
      expect(screen.getByText("Action 2")).toBeInTheDocument()
    })

    it("shows shortcut when provided", () => {
      const items = [
        {
          id: "cmd1",
          label: "Quick Action",
          shortcut: "Ctrl+Q",
          onSelect: vi.fn(),
        },
      ]

      render(<CommandPalette {...defaultProps} items={items} />)

      expect(screen.getByText("Ctrl+Q")).toBeInTheDocument()
    })

    it("calls onSelect when item clicked", async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      const items = [
        {
          id: "cmd1",
          label: "Clickable Item",
          onSelect,
        },
      ]

      render(<CommandPalette {...defaultProps} items={items} />)

      await user.click(screen.getByText("Clickable Item"))

      expect(onSelect).toHaveBeenCalled()
    })
  })
})

describe("useCommandPalette", () => {
  it("returns open state initially false", () => {
    const { result } = renderHook(() => useCommandPalette())

    expect(result.current.open).toBe(false)
  })

  it("returns setOpen function", () => {
    const { result } = renderHook(() => useCommandPalette())

    expect(typeof result.current.setOpen).toBe("function")
  })

  it("setOpen changes open state", () => {
    const { result } = renderHook(() => useCommandPalette())

    act(() => {
      result.current.setOpen(true)
    })

    expect(result.current.open).toBe(true)
  })

  it("Ctrl+K opens palette", () => {
    const { result } = renderHook(() => useCommandPalette())

    act(() => {
      fireEvent.keyDown(document, { key: "k", ctrlKey: true })
    })

    expect(result.current.open).toBe(true)
  })

  it("Cmd+K opens palette", () => {
    const { result } = renderHook(() => useCommandPalette())

    act(() => {
      fireEvent.keyDown(document, { key: "k", metaKey: true })
    })

    expect(result.current.open).toBe(true)
  })

  it("Ctrl+K toggles palette", () => {
    const { result } = renderHook(() => useCommandPalette())

    act(() => {
      result.current.setOpen(true)
    })

    expect(result.current.open).toBe(true)

    act(() => {
      fireEvent.keyDown(document, { key: "k", ctrlKey: true })
    })

    expect(result.current.open).toBe(false)
  })
})
