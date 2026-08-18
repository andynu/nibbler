import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useTtsPlayer } from "./useTtsPlayer"

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

describe("useTtsPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("terminal statuses on the first response", () => {
    it("surfaces a generation job that already failed", async () => {
      mockAudioApi.mockResolvedValue({
        status: "error",
        error: "GenerateArticleAudioJob: piper exited 1",
      })
      const { result } = renderHook(() => useTtsPlayer())

      await act(async () => {
        await result.current.requestAudio(1)
      })

      expect(result.current.state).toBe("error")
      expect(result.current.error).toBe("GenerateArticleAudioJob: piper exited 1")
    })

    it("falls back to a generic message when the server sends no error text", async () => {
      mockAudioApi.mockResolvedValue({ status: "error" })
      const { result } = renderHook(() => useTtsPlayer())

      await act(async () => {
        await result.current.requestAudio(1)
      })

      expect(result.current.state).toBe("error")
      expect(result.current.error).toBe("Audio generation failed")
    })

    it("surfaces an unavailable TTS toolchain", async () => {
      mockAudioApi.mockResolvedValue({ status: "unavailable" })
      const { result } = renderHook(() => useTtsPlayer())

      await act(async () => {
        await result.current.requestAudio(1)
      })

      expect(result.current.state).toBe("error")
      expect(result.current.error).toBe("Text-to-speech is not available")
    })
  })

  describe("terminal statuses while polling", () => {
    it("stops polling once a generating job reports failure", async () => {
      vi.useFakeTimers()
      mockAudioApi
        .mockResolvedValueOnce({ status: "generating" })
        .mockResolvedValue({ status: "error", error: "job died" })
      const { result } = renderHook(() => useTtsPlayer())

      await act(async () => {
        await result.current.requestAudio(1)
      })
      expect(result.current.state).toBe("generating")

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
      })

      expect(result.current.state).toBe("error")
      expect(result.current.error).toBe("job died")

      // The interval must be cleared, not left running against a terminal status
      const callsAtFailure = mockAudioApi.mock.calls.length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 5)
      })
      expect(mockAudioApi).toHaveBeenCalledTimes(callsAtFailure)
    })

    it("stops polling when the toolchain goes away mid-generation", async () => {
      vi.useFakeTimers()
      mockAudioApi
        .mockResolvedValueOnce({ status: "generating" })
        .mockResolvedValue({ status: "unavailable" })
      const { result } = renderHook(() => useTtsPlayer())

      await act(async () => {
        await result.current.requestAudio(1)
      })
      expect(result.current.state).toBe("generating")

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
      })

      expect(result.current.state).toBe("error")
      expect(result.current.error).toBe("Text-to-speech is not available")

      const callsAtFailure = mockAudioApi.mock.calls.length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 5)
      })
      expect(mockAudioApi).toHaveBeenCalledTimes(callsAtFailure)
    })
  })
})
