import { useState, useRef, useCallback, useEffect } from "react"
import { api, type WordTimestamp } from "@/lib/api"
import { usePreferences } from "@/contexts/PreferencesContext"

export type TtsState = "idle" | "loading" | "generating" | "ready" | "playing" | "paused" | "error"

interface TtsPlayerState {
  state: TtsState
  currentTime: number
  duration: number
  currentWordIndex: number
  timestamps: WordTimestamp[]
  error: string | null
  autoScroll: boolean
}

interface TtsPlayerControls {
  play: () => void
  pause: () => void
  stop: () => void
  reset: () => void
  seek: (time: number) => void
  toggle: () => void
  toggleAutoScroll: () => void
  pauseAutoScroll: () => void
  setPlaybackSpeed: (speed: number) => void
}

interface UseTtsPlayerResult extends TtsPlayerState, TtsPlayerControls {
  requestAudio: (entryId: number) => Promise<void>
  isActive: boolean
  playbackSpeed: number
}

const POLL_INTERVAL = 2000 // Poll every 2 seconds while generating

export function useTtsPlayer(): UseTtsPlayerResult {
  const { preferences, updatePreference } = usePreferences()
  const [state, setState] = useState<TtsState>("idle")
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentWordIndex, setCurrentWordIndex] = useState(-1)
  const [timestamps, setTimestamps] = useState<WordTimestamp[]>([])
  const [error, setError] = useState<string | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const entryIdRef = useRef<number | null>(null)
  const pollIntervalRef = useRef<number | null>(null)

  // Get playback speed from preferences
  const playbackSpeed = parseFloat(preferences.tts_playback_speed) || 1

  // Clean up audio element and polling
  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ""
      audioRef.current = null
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    entryIdRef.current = null
  }, [])

  // Clean up on unmount
  useEffect(() => {
    return cleanup
  }, [cleanup])

  // Apply playback speed to audio element when it changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed])

  // Update current word index based on playback time
  const updateCurrentWord = useCallback((time: number) => {
    if (timestamps.length === 0) {
      setCurrentWordIndex(-1)
      return
    }

    // Find the word that contains the current time
    const index = timestamps.findIndex(
      (ts, i) => time >= ts.start && (i === timestamps.length - 1 || time < timestamps[i + 1].start)
    )
    setCurrentWordIndex(index)
  }, [timestamps])

  // Request audio for an entry
  const requestAudio = useCallback(async (entryId: number) => {
    // Clean up any existing playback
    cleanup()

    entryIdRef.current = entryId
    setState("loading")
    setError(null)
    setCurrentTime(0)
    setDuration(0)
    setCurrentWordIndex(-1)
    setTimestamps([])

    try {
      const response = await api.entries.audio(entryId)

      if (response.status === "generating") {
        setState("generating")

        // Poll for completion
        pollIntervalRef.current = window.setInterval(async () => {
          if (entryIdRef.current !== entryId) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
            return
          }

          try {
            const pollResponse = await api.entries.audio(entryId)
            if (pollResponse.status === "ready" && pollResponse.audio_url) {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
              pollIntervalRef.current = null

              setTimestamps(pollResponse.timestamps || [])
              setDuration(pollResponse.duration || 0)
              // Stay in "loading" state until audio is actually ready to play

              // Create and configure audio element
              const audio = new Audio(pollResponse.audio_url)
              audio.playbackRate = playbackSpeed
              audioRef.current = audio

              audio.addEventListener("canplaythrough", () => {
                setState("ready")
              })

              audio.addEventListener("timeupdate", () => {
                setCurrentTime(audio.currentTime)
                updateCurrentWord(audio.currentTime)
              })

              audio.addEventListener("ended", () => {
                setState("ready")
                setCurrentTime(0)
                setCurrentWordIndex(-1)
              })

              audio.addEventListener("error", () => {
                setState("error")
                setError("Failed to load audio")
              })

              // Start loading the audio
              audio.load()
            }
          } catch (err) {
            // Ignore polling errors, keep trying
          }
        }, POLL_INTERVAL)
      } else if (response.status === "ready" && response.audio_url) {
        setTimestamps(response.timestamps || [])
        setDuration(response.duration || 0)
        // Stay in "loading" state until audio is actually ready to play

        // Create and configure audio element
        const audio = new Audio(response.audio_url)
        audio.playbackRate = playbackSpeed
        audioRef.current = audio

        audio.addEventListener("canplaythrough", () => {
          setState("ready")
        })

        audio.addEventListener("timeupdate", () => {
          setCurrentTime(audio.currentTime)
          updateCurrentWord(audio.currentTime)
        })

        audio.addEventListener("ended", () => {
          setState("ready")
          setCurrentTime(0)
          setCurrentWordIndex(-1)
        })

        audio.addEventListener("error", () => {
          setState("error")
          setError("Failed to load audio")
        })

        // Start loading the audio
        audio.load()
      }
    } catch (err) {
      setState("error")
      setError(err instanceof Error ? err.message : "Failed to request audio")
    }
  }, [cleanup, updateCurrentWord, playbackSpeed])

  const play = useCallback(() => {
    if (audioRef.current && (state === "ready" || state === "paused")) {
      audioRef.current.play()
        .then(() => {
          setState("playing")
        })
        .catch((err) => {
          console.error("Playback failed:", err)
          setState("error")
          setError("Playback failed: " + (err.message || "unknown error"))
        })
    }
  }, [state])

  const pause = useCallback(() => {
    if (audioRef.current && state === "playing") {
      audioRef.current.pause()
      setState("paused")
    }
  }, [state])

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setCurrentTime(0)
      setCurrentWordIndex(-1)
      setState("ready")
    }
  }, [])

  // Full reset - returns to idle state and cleans up resources
  const reset = useCallback(() => {
    cleanup()
    setState("idle")
    setCurrentTime(0)
    setDuration(0)
    setCurrentWordIndex(-1)
    setTimestamps([])
    setError(null)
    setAutoScroll(true)
  }, [cleanup])

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
      updateCurrentWord(time)
    }
  }, [updateCurrentWord])

  const toggle = useCallback(() => {
    if (state === "playing") {
      pause()
    } else if (state === "ready" || state === "paused") {
      play()
    }
  }, [state, play, pause])

  const toggleAutoScroll = useCallback(() => {
    setAutoScroll((prev) => !prev)
  }, [])

  const pauseAutoScroll = useCallback(() => {
    setAutoScroll(false)
  }, [])

  const setPlaybackSpeed = useCallback((speed: number) => {
    updatePreference("tts_playback_speed", String(speed))
  }, [updatePreference])

  const isActive = state !== "idle" && state !== "error"

  return {
    state,
    currentTime,
    duration,
    currentWordIndex,
    timestamps,
    error,
    autoScroll,
    playbackSpeed,
    requestAudio,
    play,
    pause,
    stop,
    reset,
    seek,
    toggle,
    toggleAutoScroll,
    pauseAutoScroll,
    setPlaybackSpeed,
    isActive,
  }
}
