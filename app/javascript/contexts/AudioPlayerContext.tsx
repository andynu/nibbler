import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from "react"
import { api, type WordTimestamp } from "@/lib/api"
import { usePreferences } from "@/contexts/PreferencesContext"

export type AudioState = "idle" | "loading" | "generating" | "ready" | "playing" | "paused" | "error"

export type AudioSource = "tts" | "podcast"

interface AudioPlayerContextValue {
  // State
  state: AudioState
  source: AudioSource | null
  currentTime: number
  duration: number
  currentWordIndex: number
  timestamps: WordTimestamp[]
  error: string | null
  autoScroll: boolean
  playbackSpeed: number
  isVisible: boolean
  activeEntryId: number | null
  activeEntryTitle: string | null
  activeFeedTitle: string | null

  // Controls
  play: () => void
  pause: () => void
  stop: () => void
  reset: () => void
  seek: (time: number) => void
  toggle: () => void
  toggleAutoScroll: () => void
  pauseAutoScroll: () => void
  setPlaybackSpeed: (speed: number) => void
  dismiss: () => void

  // TTS-specific
  requestTtsAudio: (entryId: number, entryTitle: string, feedTitle?: string) => Promise<void>

  // Podcast-specific
  requestPodcastAudio: (entryId: number, entryTitle: string, audioUrl: string, feedTitle?: string, audioDuration?: number) => void

  // Navigation
  jumpToSource: () => void
  onJumpToEntry: ((entryId: number) => void) | null
  setOnJumpToEntry: (callback: ((entryId: number) => void) | null) => void

  // Computed
  isActive: boolean
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null)

const POLL_INTERVAL = 2000

interface AudioPlayerProviderProps {
  children: ReactNode
}

export function AudioPlayerProvider({ children }: AudioPlayerProviderProps) {
  const { preferences, updatePreference } = usePreferences()

  // Audio state
  const [state, setState] = useState<AudioState>("idle")
  const [source, setSource] = useState<AudioSource | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentWordIndex, setCurrentWordIndex] = useState(-1)
  const [timestamps, setTimestamps] = useState<WordTimestamp[]>([])
  const [error, setError] = useState<string | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [isVisible, setIsVisible] = useState(false)
  const [activeEntryId, setActiveEntryId] = useState<number | null>(null)
  const [activeEntryTitle, setActiveEntryTitle] = useState<string | null>(null)
  const [activeFeedTitle, setActiveFeedTitle] = useState<string | null>(null)
  const [onJumpToEntry, setOnJumpToEntry] = useState<((entryId: number) => void) | null>(null)

  // Refs
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

  // Show panel when audio becomes active
  useEffect(() => {
    if (state !== "idle" && state !== "error") {
      setIsVisible(true)
    }
  }, [state])

  // Update current word index based on playback time
  const updateCurrentWord = useCallback((time: number) => {
    if (timestamps.length === 0) {
      setCurrentWordIndex(-1)
      return
    }

    const index = timestamps.findIndex(
      (ts, i) => time >= ts.start && (i === timestamps.length - 1 || time < timestamps[i + 1].start)
    )
    setCurrentWordIndex(index)
  }, [timestamps])

  // Request TTS audio for an entry
  const requestTtsAudio = useCallback(async (entryId: number, entryTitle: string, feedTitle?: string) => {
    // Clean up any existing playback
    cleanup()

    entryIdRef.current = entryId
    setActiveEntryId(entryId)
    setActiveEntryTitle(entryTitle)
    setActiveFeedTitle(feedTitle || null)
    setSource("tts")
    setState("loading")
    setError(null)
    setCurrentTime(0)
    setDuration(0)
    setCurrentWordIndex(-1)
    setTimestamps([])
    setIsVisible(true)

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

              audio.load()
            }
          } catch {
            // Ignore polling errors, keep trying
          }
        }, POLL_INTERVAL)
      } else if (response.status === "ready" && response.audio_url) {
        setTimestamps(response.timestamps || [])
        setDuration(response.duration || 0)

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

        audio.load()
      }
    } catch (err) {
      setState("error")
      setError(err instanceof Error ? err.message : "Failed to request audio")
    }
  }, [cleanup, updateCurrentWord, playbackSpeed])

  // Request podcast audio for an entry
  const requestPodcastAudio = useCallback((
    entryId: number,
    entryTitle: string,
    audioUrl: string,
    feedTitle?: string,
    audioDuration?: number
  ) => {
    // Clean up any existing playback
    cleanup()

    entryIdRef.current = entryId
    setActiveEntryId(entryId)
    setActiveEntryTitle(entryTitle)
    setActiveFeedTitle(feedTitle || null)
    setSource("podcast")
    setState("loading")
    setError(null)
    setCurrentTime(0)
    setDuration(audioDuration || 0)
    setCurrentWordIndex(-1)
    setTimestamps([]) // Podcasts don't have word-level timestamps
    setIsVisible(true)

    // Create and configure audio element
    const audio = new Audio(audioUrl)
    audio.playbackRate = playbackSpeed
    audioRef.current = audio

    audio.addEventListener("canplaythrough", () => {
      // Update duration from audio element if not provided
      if (!audioDuration && audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration)
      }
      setState("ready")
    })

    audio.addEventListener("loadedmetadata", () => {
      // Also try to get duration from metadata
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration)
      }
    })

    audio.addEventListener("timeupdate", () => {
      setCurrentTime(audio.currentTime)
    })

    audio.addEventListener("ended", () => {
      setState("ready")
      setCurrentTime(0)
    })

    audio.addEventListener("error", () => {
      setState("error")
      setError("Failed to load audio")
    })

    // Start loading the audio
    audio.load()
  }, [cleanup, playbackSpeed])

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
    setSource(null)
    setCurrentTime(0)
    setDuration(0)
    setCurrentWordIndex(-1)
    setTimestamps([])
    setError(null)
    setAutoScroll(true)
    setIsVisible(false)
    setActiveEntryId(null)
    setActiveEntryTitle(null)
    setActiveFeedTitle(null)
  }, [cleanup])

  // Dismiss the panel without stopping audio
  const dismiss = useCallback(() => {
    setIsVisible(false)
    // If audio is not playing, also reset
    if (state !== "playing") {
      reset()
    }
  }, [state, reset])

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

  // Jump to the currently playing entry
  const jumpToSource = useCallback(() => {
    if (activeEntryId !== null && onJumpToEntry) {
      onJumpToEntry(activeEntryId)
    }
  }, [activeEntryId, onJumpToEntry])

  const isActive = state !== "idle" && state !== "error"

  const value: AudioPlayerContextValue = {
    state,
    source,
    currentTime,
    duration,
    currentWordIndex,
    timestamps,
    error,
    autoScroll,
    playbackSpeed,
    isVisible,
    activeEntryId,
    activeEntryTitle,
    activeFeedTitle,
    play,
    pause,
    stop,
    reset,
    seek,
    toggle,
    toggleAutoScroll,
    pauseAutoScroll,
    setPlaybackSpeed,
    dismiss,
    requestTtsAudio,
    requestPodcastAudio,
    jumpToSource,
    onJumpToEntry,
    setOnJumpToEntry,
    isActive,
  }

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
    </AudioPlayerContext.Provider>
  )
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext)
  if (!context) {
    throw new Error("useAudioPlayer must be used within an AudioPlayerProvider")
  }
  return context
}
