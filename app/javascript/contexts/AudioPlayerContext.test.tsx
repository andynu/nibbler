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
  const { state, error, queue, requestTtsAudio } = useAudioPlayer()

  return (
    <div>
      <div data-testid="state">{state}</div>
      <div data-testid="error">{error ?? ""}</div>
      <div data-testid="queue-statuses">{queue.map((item) => item.status).join(",")}</div>
      <div data-testid="queue-audio-urls">{queue.map((item) => item.audioUrl ?? "-").join(",")}</div>
      <div data-testid="queue-durations">{queue.map((item) => item.duration ?? "-").join(",")}</div>
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

// The provider seeds its queue from localStorage, which is the only way to
// start a render with a pending item and no auto-play side effects.
function seedQueue(entryId: number) {
  localStorage.setItem(
    "nibbler:audioQueue",
    JSON.stringify([
      {
        id: "queued-item",
        entryId,
        entryTitle: "A queued entry",
        source: "tts",
        status: "pending",
      },
    ])
  )
}

describe("AudioPlayerContext", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
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

  describe("queue pre-generation", () => {
    it("marks the item errored when a poll request rejects", async () => {
      vi.useFakeTimers()
      seedQueue(42)
      mockAudioApi
        .mockResolvedValueOnce({ status: "generating" })
        .mockRejectedValue(new Error("network is down"))
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

      await act(async () => {
        renderPlayer()
      })
      expect(screen.getByTestId("queue-statuses")).toHaveTextContent("generating")

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
      })

      expect(screen.getByTestId("queue-statuses")).toHaveTextContent("error")

      // A rejection must stop the poll chain, not leave it running
      const callsAtFailure = mockAudioApi.mock.calls.length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 5)
      })
      expect(mockAudioApi).toHaveBeenCalledTimes(callsAtFailure)

      warn.mockRestore()
    })

    it("marks the item errored when a poll reports a terminal status", async () => {
      vi.useFakeTimers()
      seedQueue(43)
      mockAudioApi
        .mockResolvedValueOnce({ status: "generating" })
        .mockResolvedValue({ status: "error", error: "job died" })
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

      await act(async () => {
        renderPlayer()
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
      })

      expect(screen.getByTestId("queue-statuses")).toHaveTextContent("error")

      const callsAtFailure = mockAudioApi.mock.calls.length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 5)
      })
      expect(mockAudioApi).toHaveBeenCalledTimes(callsAtFailure)

      warn.mockRestore()
    })

    it("marks the item ready once generation completes", async () => {
      vi.useFakeTimers()
      seedQueue(44)
      mockAudioApi
        .mockResolvedValueOnce({ status: "generating" })
        .mockResolvedValue({ status: "ready", audio_url: "/audio/44.mp3" })

      await act(async () => {
        renderPlayer()
      })
      expect(screen.getByTestId("queue-statuses")).toHaveTextContent("generating")

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
      })

      expect(screen.getByTestId("queue-statuses")).toHaveTextContent("ready")

      const callsAtReady = mockAudioApi.mock.calls.length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 5)
      })
      expect(mockAudioApi).toHaveBeenCalledTimes(callsAtReady)
    })

    it("stores the generated audio url and duration on the queue item", async () => {
      vi.useFakeTimers()
      seedQueue(45)
      mockAudioApi
        .mockResolvedValueOnce({ status: "generating" })
        .mockResolvedValue({ status: "ready", audio_url: "/audio/45.mp3", duration: 92 })

      await act(async () => {
        renderPlayer()
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
      })

      expect(screen.getByTestId("queue-statuses")).toHaveTextContent("ready")
      expect(screen.getByTestId("queue-audio-urls")).toHaveTextContent("/audio/45.mp3")
      expect(screen.getByTestId("queue-durations")).toHaveTextContent("92")
    })

    it("marks an already-generated item ready without polling", async () => {
      seedQueue(46)
      mockAudioApi.mockResolvedValue({
        status: "ready",
        audio_url: "/audio/46.mp3",
        duration: 30,
      })

      await act(async () => {
        renderPlayer()
      })

      await waitFor(() => {
        expect(screen.getByTestId("queue-statuses")).toHaveTextContent("ready")
      })
      expect(screen.getByTestId("queue-audio-urls")).toHaveTextContent("/audio/46.mp3")
      // A ready response short-circuits: no "generating" flash, no poll
      expect(mockAudioApi).toHaveBeenCalledTimes(1)
    })

    it("marks the item errored when the first response is terminal", async () => {
      seedQueue(47)
      mockAudioApi.mockResolvedValue({ status: "unavailable", error: "piper is not installed" })
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

      await act(async () => {
        renderPlayer()
      })

      await waitFor(() => {
        expect(screen.getByTestId("queue-statuses")).toHaveTextContent("error")
      })
      expect(mockAudioApi).toHaveBeenCalledTimes(1)

      warn.mockRestore()
    })
  })
})
