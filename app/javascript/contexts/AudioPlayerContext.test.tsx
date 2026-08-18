import { render, screen, act, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { AudioPlayerProvider, useAudioPlayer } from "./AudioPlayerContext"

const POLL_INTERVAL = 2000

const mockAudioApi = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    entries: {
      audio: (id: number) => mockAudioApi(id),
    },
  },
}))

vi.mock("@/contexts/PreferencesContext", () => ({
  usePreferences: () => ({
    preferences: { tts_playback_speed: "1" },
    updatePreference: vi.fn(),
  }),
}))

function TestConsumer() {
  const { state, error, requestTtsAudio } = useAudioPlayer()

  return (
    <div>
      <div data-testid="state">{state}</div>
      <div data-testid="error">{error ?? ""}</div>
      <button onClick={() => requestTtsAudio(1, "An entry", "A feed")}>
        Request audio
      </button>
    </div>
  )
}

function renderPlayer() {
  return render(
    <AudioPlayerProvider>
      <TestConsumer />
    </AudioPlayerProvider>
  )
}

describe("AudioPlayerContext", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("requestTtsAudio terminal statuses", () => {
    it("surfaces a previously failed generation job", async () => {
      mockAudioApi.mockResolvedValue({
        status: "error",
        error: "GenerateArticleAudioJob: piper exited 1",
      })
      const user = userEvent.setup()
      renderPlayer()

      await user.click(screen.getByRole("button", { name: "Request audio" }))

      await waitFor(() => {
        expect(screen.getByTestId("state")).toHaveTextContent("error")
      })
      expect(screen.getByTestId("error")).toHaveTextContent(
        "GenerateArticleAudioJob: piper exited 1"
      )
    })

    it("falls back to a generic message when the server sends no error text", async () => {
      mockAudioApi.mockResolvedValue({ status: "error" })
      const user = userEvent.setup()
      renderPlayer()

      await user.click(screen.getByRole("button", { name: "Request audio" }))

      await waitFor(() => {
        expect(screen.getByTestId("state")).toHaveTextContent("error")
      })
      expect(screen.getByTestId("error")).toHaveTextContent("Audio generation failed")
    })

    it("surfaces an unavailable TTS toolchain", async () => {
      mockAudioApi.mockResolvedValue({
        status: "unavailable",
        error: "piper is not installed",
      })
      const user = userEvent.setup()
      renderPlayer()

      await user.click(screen.getByRole("button", { name: "Request audio" }))

      await waitFor(() => {
        expect(screen.getByTestId("state")).toHaveTextContent("error")
      })
      expect(screen.getByTestId("error")).toHaveTextContent("piper is not installed")
    })

    it("stops polling once a generating job reports failure", async () => {
      vi.useFakeTimers()
      mockAudioApi
        .mockResolvedValueOnce({ status: "generating" })
        .mockResolvedValue({ status: "error", error: "job died" })
      renderPlayer()

      // fireEvent rather than userEvent: userEvent's own timers deadlock
      // against vi.useFakeTimers here, and the click itself is not under test
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Request audio" }))
      })
      expect(screen.getByTestId("state")).toHaveTextContent("generating")

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
      })

      expect(screen.getByTestId("state")).toHaveTextContent("error")
      expect(screen.getByTestId("error")).toHaveTextContent("job died")

      // The interval must be cleared, not left running against a terminal status
      const callsAtFailure = mockAudioApi.mock.calls.length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 5)
      })
      expect(mockAudioApi).toHaveBeenCalledTimes(callsAtFailure)
    })
  })
})
