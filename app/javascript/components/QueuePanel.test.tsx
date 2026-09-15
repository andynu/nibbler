import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { QueuePanel } from "./QueuePanel"
import { useKeyboardCommands } from "@/hooks/useKeyboardCommands"
import type { QueueItem } from "@/lib/api"

const queue: QueueItem[] = [
  { id: "q1", entryId: 1, entryTitle: "Playing article", source: "tts", status: "ready" },
  { id: "q2", entryId: 2, entryTitle: "Second article", source: "tts", status: "ready" },
  { id: "q3", entryId: 3, entryTitle: "Last article", source: "tts", status: "ready" },
]

const mockAudioPlayer = {
  queue,
  currentQueueIndex: 0,
  isQueuePanelOpen: true,
  toggleQueuePanel: vi.fn(),
  removeFromQueue: vi.fn(),
  clearQueue: vi.fn(),
  reorderQueue: vi.fn(),
  playQueueItem: vi.fn(),
}

vi.mock("@/contexts/AudioPlayerContext", () => ({
  useAudioPlayer: () => mockAudioPlayer,
}))

/**
 * The page's shortcuts on the keys a keyboard drag uses, plus one it does not.
 * Mounted before the panel, so its document listener is registered ahead of
 * the one dnd-kit adds on pickup, the same order the app has.
 */
const SHORTCUT_KEYS = [" ", "Enter", "Escape", "ArrowDown", "x"]

function PageShortcuts({ onKey }: { onKey: (key: string) => void }) {
  useKeyboardCommands(
    SHORTCUT_KEYS.map((key) => ({ key, description: key, handler: () => onKey(key) }))
  )
  return null
}

function renderWithShortcuts() {
  const onKey = vi.fn()
  render(
    <>
      <PageShortcuts onKey={onKey} />
      <QueuePanel />
    </>
  )
  const grip = screen.getByRole("button", { name: "Move Second article" })
  grip.focus()
  expect(grip).toHaveFocus()
  return { onKey, grip }
}

async function expectLifted(grip: HTMLElement) {
  await waitFor(() => expect(grip).toHaveAttribute("aria-pressed", "true"))
}

async function expectPutDown(grip: HTMLElement) {
  await waitFor(() => expect(grip).not.toHaveAttribute("aria-pressed", "true"))
}

const px = (value: string) => parseFloat(value) || 0

/** The box of the nearest element, this one or an ancestor, placed by an inline top. */
function inlineBoxOf(element: HTMLElement) {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.style.top) {
      return {
        top: px(node.style.top),
        left: px(node.style.left),
        width: px(node.style.width),
        height: px(node.style.height),
      }
    }
  }
  return { top: 0, left: 0, width: 0, height: 0 }
}

/**
 * happy-dom lays nothing out, so every row measures zero and an arrow key has
 * no row to move to. This stacks the rows 40px apart in document order.
 * DragOverlay places a wrapper over the lifted row with an inline box, and
 * dnd-kit collides the rows against the overlay measured inside it, so
 * anything else reports the inline box it sits in.
 */
function stackQueueRows() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement
  ) {
    const index = screen.queryAllByTestId("queue-item").indexOf(this)
    const { top, left, width, height } =
      index === -1 ? inlineBoxOf(this) : { top: index * 40, left: 0, width: 320, height: 36 }
    return {
      x: left,
      y: top,
      top,
      left,
      right: left + width,
      bottom: top + height,
      width,
      height,
      toJSON: () => ({}),
    }
  })
}

async function expectAnnounced(text: string) {
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(text))
}

describe("QueuePanel keyboard reordering", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("keys the drag handle uses", () => {
    it.each([
      ["Space", " "],
      ["Enter", "{Enter}"],
    ])("%s picks a row up and puts it down without reaching the page shortcuts", async (_name, key) => {
      const user = userEvent.setup()
      const { onKey, grip } = renderWithShortcuts()

      await user.keyboard(key)
      await expectLifted(grip)
      await user.keyboard("{ArrowDown}")
      await user.keyboard(key)
      await expectPutDown(grip)

      expect(onKey).not.toHaveBeenCalled()
    })

    it("Escape puts a lifted row back without reaching the page shortcuts", async () => {
      const user = userEvent.setup()
      const { onKey, grip } = renderWithShortcuts()

      await user.keyboard(" ")
      await expectLifted(grip)
      await user.keyboard("{Escape}")
      await expectPutDown(grip)

      expect(onKey).not.toHaveBeenCalled()
    })
  })

  describe("keys the drag handle leaves alone", () => {
    it("reach the page shortcuts while a row is lifted", async () => {
      const user = userEvent.setup()
      const { onKey, grip } = renderWithShortcuts()

      await user.keyboard(" ")
      await expectLifted(grip)
      await user.keyboard("x")

      expect(onKey).toHaveBeenCalledTimes(1)
      expect(onKey).toHaveBeenCalledWith("x")
    })

    it("include Escape on a grip whose row is not lifted", async () => {
      const user = userEvent.setup()
      const { onKey } = renderWithShortcuts()

      await user.keyboard("{Escape}")

      expect(onKey).toHaveBeenCalledTimes(1)
      expect(onKey).toHaveBeenCalledWith("Escape")
    })
  })
})

describe("QueuePanel drag handles for screen readers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("names each grip after the article it moves", () => {
    render(<QueuePanel />)

    for (const item of queue) {
      expect(screen.getByRole("button", { name: `Move ${item.entryTitle}` })).toBeInTheDocument()
    }
  })

  it("describes how to move a row with the keyboard", () => {
    render(<QueuePanel />)

    expect(screen.getByRole("button", { name: "Move Second article" })).toHaveAccessibleDescription(
      "To move an item, press Space or Enter to pick it up. Use the up and down arrow keys to move it, then press Space or Enter to drop it. Press Escape to cancel."
    )
  })

  describe("announcements", () => {
    beforeEach(() => {
      stackQueueRows()
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    async function pickUpSecondArticle() {
      const user = userEvent.setup()
      render(<QueuePanel />)
      const grip = screen.getByRole("button", { name: "Move Second article" })
      grip.focus()
      await user.keyboard(" ")
      await expectLifted(grip)
      return user
    }

    it("name the article and its place when a row is picked up", async () => {
      await pickUpSecondArticle()

      await expectAnnounced("Picked up Second article at position 2 of 3.")
    })

    it("name the position a lifted row moves to", async () => {
      const user = await pickUpSecondArticle()

      await user.keyboard("{ArrowDown}")

      await expectAnnounced("Second article moved to position 3 of 3.")
    })

    it("name a row's own position when it moves back to it", async () => {
      const user = await pickUpSecondArticle()
      await user.keyboard("{ArrowDown}")
      await expectAnnounced("Second article moved to position 3 of 3.")

      await user.keyboard("{ArrowUp}")

      await expectAnnounced("Second article moved to position 2 of 3.")
    })

    it("name the position a row is dropped at, which is where the queue puts it", async () => {
      const user = await pickUpSecondArticle()
      await user.keyboard("{ArrowDown}")
      await expectAnnounced("Second article moved to position 3 of 3.")

      await user.keyboard(" ")

      await expectAnnounced("Dropped Second article at position 3 of 3.")
      expect(mockAudioPlayer.reorderQueue).toHaveBeenCalledWith(1, 2)
    })

    it("name the position a canceled row returns to", async () => {
      const user = await pickUpSecondArticle()
      await user.keyboard("{ArrowDown}")
      await expectAnnounced("Second article moved to position 3 of 3.")

      await user.keyboard("{Escape}")

      await expectAnnounced("Move canceled. Second article is back at position 2 of 3.")
      expect(mockAudioPlayer.reorderQueue).not.toHaveBeenCalled()
    })
  })
})
