import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import React from "react"
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog"

describe("KeyboardShortcutsDialog", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
  }

  describe("rendering", () => {
    it("shows dialog when open is true", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} open={true} />)

      expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument()
    })

    it("does not show dialog when open is false", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} open={false} />)

      expect(screen.queryByText("Keyboard Shortcuts")).not.toBeInTheDocument()
    })

    it("shows dialog description", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      expect(
        screen.getByText(/navigate and interact with entries using your keyboard/i)
      ).toBeInTheDocument()
    })
  })

  describe("shortcut categories", () => {
    it("shows Navigation category", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      expect(screen.getByText("Navigation")).toBeInTheDocument()
    })

    it("shows Actions category", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      expect(screen.getByText("Actions")).toBeInTheDocument()
    })

    it("shows Other category", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      expect(screen.getByText("Other")).toBeInTheDocument()
    })
  })

  describe("Navigation shortcuts", () => {
    it("shows next entry shortcut", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      expect(screen.getByText("Next entry")).toBeInTheDocument()
      expect(screen.getByText("j / n")).toBeInTheDocument()
    })

    it("shows previous entry shortcut", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      expect(screen.getByText("Previous entry")).toBeInTheDocument()
      expect(screen.getByText("k / p")).toBeInTheDocument()
    })

    it("shows next category shortcut", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      expect(screen.getByText("Next category")).toBeInTheDocument()
      expect(screen.getByText("Shift+J")).toBeInTheDocument()
    })

    it("shows previous category shortcut", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      expect(screen.getByText("Previous category")).toBeInTheDocument()
      expect(screen.getByText("Shift+K")).toBeInTheDocument()
    })

    it("shows go to All feeds shortcut", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      expect(screen.getByText("Go to All feeds")).toBeInTheDocument()
      expect(screen.getByText("a")).toBeInTheDocument()
    })

    it("shows go to Fresh shortcut", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      expect(screen.getByText("Go to Fresh")).toBeInTheDocument()
      expect(screen.getByText("f")).toBeInTheDocument()
    })

    it("shows go to Starred shortcut", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      expect(screen.getByText("Go to Starred")).toBeInTheDocument()
      expect(screen.getByText("Shift+S")).toBeInTheDocument()
    })
  })

  describe("Action shortcuts", () => {
    it("shows open entry shortcut", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      expect(screen.getByText("Open entry")).toBeInTheDocument()
      expect(screen.getByText("o / Enter")).toBeInTheDocument()
    })

    it("shows toggle read/unread shortcut", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      expect(screen.getByText("Toggle read/unread")).toBeInTheDocument()
      expect(screen.getByText("m / u")).toBeInTheDocument()
    })

    it("shows toggle starred shortcut", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      expect(screen.getByText("Toggle starred")).toBeInTheDocument()
      expect(screen.getByText("s")).toBeInTheDocument()
    })

    it("shows open original link shortcut", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      expect(screen.getByText("Open original link")).toBeInTheDocument()
      expect(screen.getByText("v")).toBeInTheDocument()
    })

    it("shows refresh entries shortcut", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      expect(screen.getByText("Refresh entries")).toBeInTheDocument()
      expect(screen.getByText("r")).toBeInTheDocument()
    })
  })

  describe("Other shortcuts", () => {
    it("shows command palette shortcut", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      expect(screen.getByText("Open command palette")).toBeInTheDocument()
      expect(screen.getByText("Ctrl+K")).toBeInTheDocument()
    })

    it("shows escape shortcut", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      expect(screen.getByText("Close/deselect entry")).toBeInTheDocument()
      expect(screen.getByText("Escape")).toBeInTheDocument()
    })

    it("shows help shortcut", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      expect(screen.getByText("Show keyboard shortcuts")).toBeInTheDocument()
      expect(screen.getByText("?")).toBeInTheDocument()
    })
  })

  describe("keyboard styling", () => {
    it("renders key bindings in kbd elements", () => {
      render(<KeyboardShortcutsDialog {...defaultProps} />)

      const kbdElements = document.querySelectorAll("kbd")
      expect(kbdElements.length).toBeGreaterThan(0)
      // Each shortcut should have a kbd element (9 navigation + 5 actions + 3 other)
      expect(kbdElements.length).toBe(17)
    })
  })
})
