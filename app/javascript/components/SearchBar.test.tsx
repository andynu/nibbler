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
