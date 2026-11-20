import { render, screen, act, fireEvent, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useEffect } from "react"
import { AudioPlayerProvider, useAudioPlayer } from "./AudioPlayerContext"
import { AudioPanel } from "@/components/AudioPanel"

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

  describe("dismissing the panel", () => {
    // happy-dom does not play media, so the element's lifecycle is driven by
    // hand: load() records the element, and the test fires its events.
    let elements: HTMLMediaElement[]
    let playSpy: ReturnType<typeof vi.spyOn>
    let pauseSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      elements = []
      playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
      pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
      vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (this: HTMLMediaElement) {
        elements.push(this)
      })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    function DismissConsumer() {
      const player = useAudioPlayer()

      return (
        <div>
          <div data-testid="state">{player.state}</div>
          <div data-testid="visible">{player.isVisible ? "yes" : "no"}</div>
          <div data-testid="source">{player.source ?? "-"}</div>
          <div data-testid="active-entry">{player.activeEntryId ?? "-"}</div>
          <div data-testid="current-time">{player.currentTime}</div>
          <button onClick={() => player.requestTtsAudio(1, "An entry", "A feed")}>Listen</button>
          <button onClick={() => player.requestPodcastAudio(2, "An episode", "/ep.mp3", "A podcast", 600)}>
            Play episode
          </button>
          <button onClick={() => player.addToQueue({ entryId: 3, entryTitle: "First", source: "podcast", audioUrl: "/one.mp3" })}>
            Queue first episode
          </button>
          <button onClick={() => player.addToQueue({ entryId: 4, entryTitle: "Second", source: "podcast", audioUrl: "/two.mp3" })}>
            Queue second episode
          </button>
          <div data-testid="queue-length">{player.queue.length}</div>
          <button onClick={player.pause}>Pause</button>
          <button onClick={player.dismiss}>Close</button>
          <div data-testid="can-reopen">{player.canReopen ? "yes" : "no"}</div>
          <button onClick={player.reopen}>Reopen</button>
        </div>
      )
    }

    function renderDismissable({ withPanel = false } = {}) {
      return render(
        <AudioPlayerProvider>
          <DismissConsumer />
          {withPanel && <AudioPanel />}
        </AudioPlayerProvider>
      )
    }

    async function startPlaying(buttonName: string) {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: buttonName }))
      })
      await waitFor(() => expect(elements).toHaveLength(1))
      const element = elements[0]
      await act(async () => {
        element.dispatchEvent(new Event("canplaythrough"))
      })
      await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("playing"))

      Object.defineProperty(element, "currentTime", { value: 12.5, writable: true, configurable: true })
      await act(async () => {
        element.dispatchEvent(new Event("timeupdate"))
      })
      return element
    }

    function close() {
      fireEvent.click(screen.getByRole("button", { name: "Close" }))
    }

    it("pauses a playing TTS article and keeps its place", async () => {
      mockAudioApi.mockResolvedValue({ status: "ready", audio_url: "/audio/1.mp3", duration: 60 })
      renderDismissable()
      const element = await startPlaying("Listen")

      await act(async () => close())

      expect(pauseSpy).toHaveBeenCalled()
      expect(screen.getByTestId("state")).toHaveTextContent("paused")
      expect(screen.getByTestId("visible")).toHaveTextContent("no")
      // Kept for a later reopen: same item, same position, same element
      expect(screen.getByTestId("source")).toHaveTextContent("tts")
      expect(screen.getByTestId("active-entry")).toHaveTextContent("1")
      expect(screen.getByTestId("current-time")).toHaveTextContent("12.5")
      expect(element.getAttribute("src")).toBe("/audio/1.mp3")
    })

    it("pauses a playing podcast and keeps its place", async () => {
      renderDismissable()
      await startPlaying("Play episode")

      await act(async () => close())

      expect(pauseSpy).toHaveBeenCalled()
      expect(screen.getByTestId("state")).toHaveTextContent("paused")
      expect(screen.getByTestId("visible")).toHaveTextContent("no")
      expect(screen.getByTestId("source")).toHaveTextContent("podcast")
      expect(screen.getByTestId("active-entry")).toHaveTextContent("2")
      expect(screen.getByTestId("current-time")).toHaveTextContent("12.5")
    })

    it("hides a paused player without restarting it", async () => {
      renderDismissable()
      await startPlaying("Play episode")
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Pause" }))
      })
      expect(screen.getByTestId("state")).toHaveTextContent("paused")
      const playCalls = playSpy.mock.calls.length

      expect(() => close()).not.toThrow()
      await act(async () => {})

      expect(screen.getByTestId("state")).toHaveTextContent("paused")
      expect(screen.getByTestId("visible")).toHaveTextContent("no")
      expect(screen.getByTestId("current-time")).toHaveTextContent("12.5")
      expect(playSpy).toHaveBeenCalledTimes(playCalls)
    })

    it("does not move on to the next queue item after closing", async () => {
      renderDismissable()
      await startPlaying("Queue first episode")
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Queue second episode" }))
      })
      expect(screen.getByTestId("queue-length")).toHaveTextContent("2")

      await act(async () => close())
      await act(async () => {})

      expect(screen.getByTestId("state")).toHaveTextContent("paused")
      expect(screen.getByTestId("visible")).toHaveTextContent("no")
      expect(screen.getByTestId("active-entry")).toHaveTextContent("3")
      // No second element was loaded and nothing was played again
      expect(elements).toHaveLength(1)
      expect(playSpy).toHaveBeenCalledTimes(1)
    })

    it("resets a request that is still loading", async () => {
      mockAudioApi.mockReturnValue(new Promise(() => {}))
      renderDismissable()
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Listen" }))
      })
      expect(screen.getByTestId("state")).toHaveTextContent("loading")

      await act(async () => close())

      expect(screen.getByTestId("state")).toHaveTextContent("idle")
      expect(screen.getByTestId("visible")).toHaveTextContent("no")
      expect(screen.getByTestId("active-entry")).toHaveTextContent("-")
    })

    it("reopens a closed article paused where it left off", async () => {
      mockAudioApi.mockResolvedValue({ status: "ready", audio_url: "/audio/1.mp3", duration: 60 })
      renderDismissable({ withPanel: true })
      const element = await startPlaying("Listen")
      await act(async () => close())
      expect(screen.queryByTestId("audio-panel")).not.toBeInTheDocument()
      expect(screen.getByTestId("can-reopen")).toHaveTextContent("yes")
      const playCalls = playSpy.mock.calls.length

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Reopen" }))
      })

      const panel = within(screen.getByTestId("audio-panel"))
      expect(panel.getByRole("button", { name: "Play" })).toBeInTheDocument()
      expect(panel.getByText("An entry")).toBeInTheDocument()
      expect(screen.getByTestId("state")).toHaveTextContent("paused")
      expect(screen.getByTestId("current-time")).toHaveTextContent("12.5")
      expect(screen.getByTestId("can-reopen")).toHaveTextContent("no")
      expect(element.getAttribute("src")).toBe("/audio/1.mp3")
      expect(playSpy).toHaveBeenCalledTimes(playCalls)
    })

    it("has nothing to reopen with no item loaded and an empty queue", async () => {
      renderDismissable({ withPanel: true })
      expect(screen.getByTestId("can-reopen")).toHaveTextContent("no")

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Reopen" }))
      })

      expect(screen.getByTestId("visible")).toHaveTextContent("no")
      expect(screen.queryByTestId("audio-panel")).not.toBeInTheDocument()
    })

    // canplaythrough fires again whenever readyState climbs back to
    // HAVE_ENOUGH_DATA, after a seek or a recovered buffering stall.
    describe("a later canplaythrough", () => {
      async function refireCanPlayThrough(element: HTMLMediaElement) {
        await act(async () => {
          element.dispatchEvent(new Event("canplaythrough"))
        })
      }

      it("does not restart a paused podcast", async () => {
        renderDismissable()
        const element = await startPlaying("Play episode")
        await act(async () => {
          fireEvent.click(screen.getByRole("button", { name: "Pause" }))
        })
        const playCalls = playSpy.mock.calls.length

        await refireCanPlayThrough(element)

        expect(playSpy).toHaveBeenCalledTimes(playCalls)
        expect(screen.getByTestId("state")).toHaveTextContent("paused")
      })

      it("does not restart or reshow a closed podcast", async () => {
        renderDismissable()
        const element = await startPlaying("Play episode")
        await act(async () => close())
        const playCalls = playSpy.mock.calls.length

        await refireCanPlayThrough(element)

        expect(playSpy).toHaveBeenCalledTimes(playCalls)
        expect(screen.getByTestId("state")).toHaveTextContent("paused")
        expect(screen.getByTestId("visible")).toHaveTextContent("no")
      })

      it("does not restart or reshow a closed TTS article", async () => {
        mockAudioApi.mockResolvedValue({ status: "ready", audio_url: "/audio/1.mp3", duration: 60 })
        renderDismissable()
        const element = await startPlaying("Listen")
        await act(async () => close())
        const playCalls = playSpy.mock.calls.length

        await refireCanPlayThrough(element)

        expect(playSpy).toHaveBeenCalledTimes(playCalls)
        expect(screen.getByTestId("state")).toHaveTextContent("paused")
        expect(screen.getByTestId("visible")).toHaveTextContent("no")
      })

      it("does not restart a closed TTS article that finished generating", async () => {
        vi.useFakeTimers()
        mockAudioApi
          .mockResolvedValueOnce({ status: "generating" })
          .mockResolvedValue({ status: "ready", audio_url: "/audio/1.mp3", duration: 60 })
        renderDismissable()
        await act(async () => {
          fireEvent.click(screen.getByRole("button", { name: "Listen" }))
        })
        expect(screen.getByTestId("state")).toHaveTextContent("generating")

        await act(async () => {
          await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
        })
        expect(elements).toHaveLength(1)
        const element = elements[0]
        await refireCanPlayThrough(element)
        expect(screen.getByTestId("state")).toHaveTextContent("playing")

        await act(async () => close())
        const playCalls = playSpy.mock.calls.length

        await refireCanPlayThrough(element)

        expect(playSpy).toHaveBeenCalledTimes(playCalls)
        expect(screen.getByTestId("state")).toHaveTextContent("paused")
        expect(screen.getByTestId("visible")).toHaveTextContent("no")
      })
    })
  })

  describe("jumping to the playing entry", () => {
    function JumpConsumer({ onJump }: { onJump: (entryId: number) => void }) {
      const { onJumpToEntry, setOnJumpToEntry, jumpToSource, requestTtsAudio } = useAudioPlayer()

      // Registered the way application.tsx registers its handler.
      useEffect(() => {
        setOnJumpToEntry(onJump)
        return () => setOnJumpToEntry(null)
      }, [setOnJumpToEntry, onJump])

      return (
        <div>
          <div data-testid="jump-registered">{onJumpToEntry ? "yes" : "no"}</div>
          <button onClick={() => requestTtsAudio(7, "An entry")}>Request audio</button>
          <button onClick={jumpToSource}>Go to playing item</button>
        </div>
      )
    }

    it("stores the registered callback rather than calling it", async () => {
      const onJump = vi.fn()

      render(
        <AudioPlayerProvider>
          <JumpConsumer onJump={onJump} />
        </AudioPlayerProvider>
      )

      expect(screen.getByTestId("jump-registered")).toHaveTextContent("yes")
      expect(onJump).not.toHaveBeenCalled()
    })

    it("hands the registered callback the playing entry's id", async () => {
      mockAudioApi.mockResolvedValue({ status: "unavailable", error: "piper is not installed" })
      const onJump = vi.fn()
      const user = userEvent.setup()

      render(
        <AudioPlayerProvider>
          <JumpConsumer onJump={onJump} />
        </AudioPlayerProvider>
      )

      await user.click(screen.getByRole("button", { name: "Request audio" }))
      await user.click(screen.getByRole("button", { name: "Go to playing item" }))

      expect(onJump).toHaveBeenCalledTimes(1)
      expect(onJump).toHaveBeenCalledWith(7)
    })
  })
})
