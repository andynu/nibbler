import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
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
  const grip = screen.getAllByRole("button", { name: "Drag to reorder" })[1]
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
