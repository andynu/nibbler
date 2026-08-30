import { useRef, useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { SearchBar } from "./SearchBar"
import { useKeyboardCommands } from "@/hooks/useKeyboardCommands"

describe("SearchBar", () => {
  const defaultProps = {
    value: "",
    onChange: vi.fn(),
  }

  it("renders a labelled search box", () => {
    render(<SearchBar {...defaultProps} />)

    expect(screen.getByRole("searchbox", { name: "Search articles" })).toBeInTheDocument()
  })

  it("reports each keystroke to the parent", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SearchBar value="" onChange={onChange} />)

    await user.type(screen.getByRole("searchbox"), "r")

    expect(onChange).toHaveBeenCalledWith("r")
  })

  it("offers a clear button only once there is something to clear", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<SearchBar value="" onChange={onChange} />)

    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument()

    rerender(<SearchBar value="rails" onChange={onChange} />)
    await user.click(screen.getByRole("button", { name: "Clear search" }))

    expect(onChange).toHaveBeenCalledWith("")
  })

  it("routes the clear button through onClear when the caller has scope to reset", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onClear = vi.fn()
    render(<SearchBar value="rails" onChange={onChange} onClear={onClear} />)

    await user.click(screen.getByRole("button", { name: "Clear search" }))

    expect(onClear).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  describe("scope pills", () => {
    const scope = {
      place: "list" as const,
      history: "list" as const,
      onPlaceChange: vi.fn(),
      onHistoryChange: vi.fn(),
      placeLabel: "Ruby Weekly",
      historyLabel: "Unread",
    }

    it("stays hidden while the box is empty", () => {
      render(<SearchBar value="" onChange={vi.fn()} scope={scope} />)

      expect(screen.queryByRole("group", { name: "Search scope" })).not.toBeInTheDocument()
    })

    it("names the scope once there is a query", () => {
      render(<SearchBar value="rails" onChange={vi.fn()} scope={scope} />)

      const group = screen.getByRole("group", { name: "Search scope" })
      expect(group).toHaveTextContent("Ruby Weekly")
      expect(group).toHaveTextContent("Unread")
    })

    it("does not render at all for a caller that supplies no scope", () => {
      render(<SearchBar value="rails" onChange={vi.fn()} />)

      expect(screen.queryByRole("group", { name: "Search scope" })).not.toBeInTheDocument()
    })

    it("widens the place on Alt+A without leaving the box", async () => {
      const user = userEvent.setup()
      const onPlaceChange = vi.fn()
      render(
        <SearchBar
          value="rails"
          onChange={vi.fn()}
          scope={{ ...scope, onPlaceChange }}
        />
      )

      const input = screen.getByRole("searchbox")
      input.focus()
      await user.keyboard("{Alt>}a{/Alt}")

      expect(onPlaceChange).toHaveBeenCalledWith("everything")
      expect(input).toHaveFocus()
    })

    it("narrows the place again on a second Alt+A", async () => {
      const user = userEvent.setup()
      const onPlaceChange = vi.fn()
      render(
        <SearchBar
          value="rails"
          onChange={vi.fn()}
          scope={{ ...scope, place: "everything", onPlaceChange }}
        />
      )

      screen.getByRole("searchbox").focus()
      await user.keyboard("{Alt>}a{/Alt}")

      expect(onPlaceChange).toHaveBeenCalledWith("list")
    })

    it("widens the history on Alt+H", async () => {
      const user = userEvent.setup()
      const onHistoryChange = vi.fn()
      render(
        <SearchBar
          value="rails"
          onChange={vi.fn()}
          scope={{ ...scope, onHistoryChange }}
        />
      )

      screen.getByRole("searchbox").focus()
      await user.keyboard("{Alt>}h{/Alt}")

      expect(onHistoryChange).toHaveBeenCalledWith("all")
    })

    it("ignores the shortcut for an axis the list does not narrow", async () => {
      const user = userEvent.setup()
      const onPlaceChange = vi.fn()
      render(
        <SearchBar
          value="rails"
          onChange={vi.fn()}
          scope={{ ...scope, placeLabel: null, onPlaceChange }}
        />
      )

      screen.getByRole("searchbox").focus()
      await user.keyboard("{Alt>}a{/Alt}")

      expect(onPlaceChange).not.toHaveBeenCalled()
    })

    it("leaves a plain a alone so it can be typed", async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      const onPlaceChange = vi.fn()
      render(
        <SearchBar
          value=""
          onChange={onChange}
          scope={{ ...scope, onPlaceChange }}
        />
      )

      await user.type(screen.getByRole("searchbox"), "a")

      expect(onChange).toHaveBeenCalledWith("a")
      expect(onPlaceChange).not.toHaveBeenCalled()
    })
  })

  describe("Escape", () => {
    it("clears the query and keeps focus when there is text", async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      const onDismiss = vi.fn()
      render(<SearchBar value="rails" onChange={onChange} onDismiss={onDismiss} />)

      const input = screen.getByRole("searchbox")
      input.focus()
      await user.keyboard("{Escape}")

      expect(onChange).toHaveBeenCalledWith("")
      expect(onDismiss).not.toHaveBeenCalled()
      expect(input).toHaveFocus()
    })

    it("resets the scope through onClear rather than just emptying the box", async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      const onClear = vi.fn()
      render(<SearchBar value="rails" onChange={onChange} onClear={onClear} />)

      screen.getByRole("searchbox").focus()
      await user.keyboard("{Escape}")

      expect(onClear).toHaveBeenCalledTimes(1)
      expect(onChange).not.toHaveBeenCalled()
    })

    it("hands the key back when the box is already empty", async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      const onDismiss = vi.fn()
      render(<SearchBar value="" onChange={onChange} onDismiss={onDismiss} />)

      const input = screen.getByRole("searchbox")
      input.focus()
      await user.keyboard("{Escape}")

      expect(onDismiss).toHaveBeenCalledTimes(1)
      expect(onChange).not.toHaveBeenCalled()
      expect(input).not.toHaveFocus()
    })
  })
})

/**
 * The box against the real document-level command listener, which is where the
 * `/` and Escape rules actually have to hold.
 */
function KeyboardHarness({ onCloseEntry }: { onCloseEntry: () => void }) {
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useKeyboardCommands([
    {
      key: "/",
      description: "Search articles",
      handler: () => inputRef.current?.focus(),
    },
    { key: "Escape", description: "Close entry", handler: onCloseEntry },
  ])

  return (
    <SearchBar ref={inputRef} value={value} onChange={setValue} onDismiss={onCloseEntry} />
  )
}

describe("SearchBar keyboard integration", () => {
  it("focuses the box when / is pressed from the list", async () => {
    const user = userEvent.setup()
    render(<KeyboardHarness onCloseEntry={vi.fn()} />)

    await user.keyboard("/")

    expect(screen.getByRole("searchbox")).toHaveFocus()
  })

  it("types a literal / inside the box instead of re-triggering the shortcut", async () => {
    const user = userEvent.setup()
    render(<KeyboardHarness onCloseEntry={vi.fn()} />)

    await user.keyboard("/")
    await user.keyboard("a/b")

    expect(screen.getByRole("searchbox")).toHaveValue("a/b")
  })

  it("does not close the open entry when Escape clears a non-empty box", async () => {
    const user = userEvent.setup()
    const onCloseEntry = vi.fn()
    render(<KeyboardHarness onCloseEntry={onCloseEntry} />)

    await user.keyboard("/")
    await user.keyboard("rails")
    await user.keyboard("{Escape}")

    expect(screen.getByRole("searchbox")).toHaveValue("")
    expect(onCloseEntry).not.toHaveBeenCalled()
  })

  it("closes the open entry when Escape arrives on an empty box", async () => {
    const user = userEvent.setup()
    const onCloseEntry = vi.fn()
    render(<KeyboardHarness onCloseEntry={onCloseEntry} />)

    await user.keyboard("/")
    await user.keyboard("{Escape}")

    expect(onCloseEntry).toHaveBeenCalledTimes(1)
  })

  it("still closes the open entry on a second Escape after the box is cleared", async () => {
    const user = userEvent.setup()
    const onCloseEntry = vi.fn()
    render(<KeyboardHarness onCloseEntry={onCloseEntry} />)

    await user.keyboard("/")
    await user.keyboard("rails")
    await user.keyboard("{Escape}")
    expect(onCloseEntry).not.toHaveBeenCalled()

    await user.keyboard("{Escape}")
    expect(onCloseEntry).toHaveBeenCalledTimes(1)
  })
})
