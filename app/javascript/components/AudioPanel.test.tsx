import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { AudioPanel } from "./AudioPanel"
import { useKeyboardCommands } from "@/hooks/useKeyboardCommands"

const mockAudioPlayer = {
  state: "paused",
  source: "tts",
  currentTime: 40,
  duration: 120,
  autoScroll: true,
  playbackSpeed: 1,
  isVisible: true,
  activeEntryTitle: "An entry",
  activeFeedTitle: "A feed",
  queue: [],
  currentQueueIndex: -1,
  isQueuePanelOpen: false,
  error: null,
  onJumpToEntry: null,
  play: vi.fn(),
  pause: vi.fn(),
  seek: vi.fn(),
  toggleAutoScroll: vi.fn(),
  setPlaybackSpeed: vi.fn(),
  dismiss: vi.fn(),
  jumpToSource: vi.fn(),
  skipToNext: vi.fn(),
  skipToPrevious: vi.fn(),
  toggleQueuePanel: vi.fn(),
  playQueueItem: vi.fn(),
  removeFromQueue: vi.fn(),
  clearQueue: vi.fn(),
  reorderQueue: vi.fn(),
}

vi.mock("@/contexts/AudioPlayerContext", () => ({
  useAudioPlayer: () => mockAudioPlayer,
}))

const SLIDER_KEYS = ["ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown", "PageUp", "PageDown", "Home", "End"]

/** The app's shortcuts, reduced to the slider keys plus one key the slider leaves alone. */
function GlobalShortcuts({ onKey }: { onKey: (key: string) => void }) {
  useKeyboardCommands(
    [...SLIDER_KEYS, "x"].map((key) => ({ key, description: key, handler: () => onKey(key) }))
  )
  return null
}

function focusSeekBar() {
  const slider = screen.getByRole("slider", { name: "Playback progress" })
  slider.focus()
  expect(slider).toHaveFocus()
  return slider
}

describe("AudioPanel seek bar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAudioPlayer.currentTime = 40
    mockAudioPlayer.duration = 120
  })

  describe("keyboard seeking", () => {
    it.each([
      ["{ArrowRight}", 45],
      ["{ArrowUp}", 45],
      ["{ArrowLeft}", 35],
      ["{ArrowDown}", 35],
      ["{PageUp}", 70],
      ["{PageDown}", 10],
      ["{Home}", 0],
      ["{End}", 120],
    ])("%s from 0:40 of 2:00 seeks to %ss", async (keys, expected) => {
      const user = userEvent.setup()
      render(<AudioPanel />)
      focusSeekBar()

      await user.keyboard(keys)

      expect(mockAudioPlayer.seek).toHaveBeenCalledTimes(1)
      expect(mockAudioPlayer.seek).toHaveBeenCalledWith(expected)
    })

    it.each([
      [118, "{ArrowRight}", 120],
      [118, "{ArrowUp}", 120],
      [100, "{PageUp}", 120],
      [2, "{ArrowLeft}", 0],
      [2, "{ArrowDown}", 0],
      [20, "{PageDown}", 0],
    ])("clamps a step from %ss with %s to %ss", async (from, keys, expected) => {
      mockAudioPlayer.currentTime = from
      const user = userEvent.setup()
      render(<AudioPanel />)
      focusSeekBar()

      await user.keyboard(keys)

      expect(mockAudioPlayer.seek).toHaveBeenCalledWith(expected)
    })

    it("does not seek while the duration is unknown", async () => {
      mockAudioPlayer.currentTime = 0
      mockAudioPlayer.duration = 0
      const user = userEvent.setup()
      render(<AudioPanel />)
      focusSeekBar()

      await user.keyboard(SLIDER_KEYS.map((key) => `{${key}}`).join(""))

      expect(mockAudioPlayer.seek).not.toHaveBeenCalled()
    })

    it("leaves a modified arrow to the browser", async () => {
      const user = userEvent.setup()
      render(<AudioPanel />)
      focusSeekBar()

      await user.keyboard("{Alt>}{ArrowLeft}{/Alt}")

      expect(mockAudioPlayer.seek).not.toHaveBeenCalled()
    })
  })

  describe("keys the seek bar handles", () => {
    it("never reach the global shortcuts, while other keys still do", async () => {
      const onKey = vi.fn()
      const user = userEvent.setup()
      render(
        <>
          <GlobalShortcuts onKey={onKey} />
          <AudioPanel />
        </>
      )
      focusSeekBar()

      await user.keyboard(SLIDER_KEYS.map((key) => `{${key}}`).join(""))
      await user.keyboard("x")

      expect(onKey).toHaveBeenCalledTimes(1)
      expect(onKey).toHaveBeenCalledWith("x")
    })

    it("are claimed from the browser, so they do not scroll the page", async () => {
      const seen: KeyboardEvent[] = []
      const record = (event: KeyboardEvent) => seen.push(event)
      window.addEventListener("keydown", record, { capture: true })
      try {
        const user = userEvent.setup()
        render(<AudioPanel />)
        focusSeekBar()

        await user.keyboard(SLIDER_KEYS.map((key) => `{${key}}`).join(""))
      } finally {
        window.removeEventListener("keydown", record, { capture: true })
      }

      expect(seen.map((event) => event.key)).toEqual(SLIDER_KEYS)
      expect(seen.filter((event) => !event.defaultPrevented).map((event) => event.key)).toEqual([])
    })
  })
})
