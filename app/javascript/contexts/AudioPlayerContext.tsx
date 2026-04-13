import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from "react"
import { api, type WordTimestamp, type QueueItem, type AudioSource } from "@/lib/api"
import { usePreferences } from "@/contexts/PreferencesContext"
import { generateUUID } from "@/lib/utils"

export type AudioState = "idle" | "loading" | "generating" | "ready" | "playing" | "paused" | "error"

export type { AudioSource }

export type QueueItemInput = Omit<QueueItem, "id" | "status">

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

  // Queue state
  queue: QueueItem[]
  currentQueueIndex: number
  isQueuePanelOpen: boolean

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

  // Queue controls
  addToQueue: (item: QueueItemInput) => void
  playNow: (item: QueueItemInput) => void
  removeFromQueue: (id: string) => void
  clearQueue: () => void
  skipToNext: () => void
  skipToPrevious: () => void
  reorderQueue: (fromIndex: number, toIndex: number) => void
  playQueueItem: (index: number) => void
  toggleQueuePanel: () => void

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

  // Queue state
  const [queue, setQueue] = useState<QueueItem[]>(() => {
    try {
      const saved = localStorage.getItem("nibbler:audioQueue")
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [currentQueueIndex, setCurrentQueueIndex] = useState(-1)
  const [isQueuePanelOpen, setIsQueuePanelOpen] = useState(false)

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const entryIdRef = useRef<number | null>(null)
  const pollIntervalRef = useRef<number | null>(null)
  const preGeneratingRef = useRef<Set<string>>(new Set())
  const skipToNextRef = useRef<(() => void) | null>(null)

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

  // Persist queue to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("nibbler:audioQueue", JSON.stringify(queue))
    } catch {
      // Ignore localStorage errors
    }
  }, [queue])

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
                // Auto-play when ready (for queue playback)
                audio.play().then(() => {
                  setState("playing")
                }).catch((err) => {
                  console.warn("Auto-play failed:", err)
                  // Stay in ready state, user can manually play
                })
              })

              audio.addEventListener("timeupdate", () => {
                setCurrentTime(audio.currentTime)
                updateCurrentWord(audio.currentTime)
              })

              audio.addEventListener("ended", () => {
                setState("ready")
                setCurrentTime(0)
                setCurrentWordIndex(-1)
                // Auto-advance to next in queue
                skipToNextRef.current?.()
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
          // Auto-play when ready (for queue playback)
          audio.play().then(() => {
            setState("playing")
          }).catch((err) => {
            console.warn("Auto-play failed:", err)
            // Stay in ready state, user can manually play
          })
        })

        audio.addEventListener("timeupdate", () => {
          setCurrentTime(audio.currentTime)
          updateCurrentWord(audio.currentTime)
        })

        audio.addEventListener("ended", () => {
          setState("ready")
          setCurrentTime(0)
          setCurrentWordIndex(-1)
          // Auto-advance to next in queue
          skipToNextRef.current?.()
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
      // Auto-play when ready (for queue playback)
      audio.play().then(() => {
        setState("playing")
      }).catch((err) => {
        console.warn("Auto-play failed:", err)
        // Stay in ready state, user can manually play
      })
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
      // Auto-advance to next in queue
      skipToNextRef.current?.()
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

  // Toggle queue panel visibility
  const toggleQueuePanel = useCallback(() => {
    setIsQueuePanelOpen((prev) => !prev)
  }, [])

  // Pre-generate TTS for a queue item in the background
  const preGenerateQueueItem = useCallback(async (item: QueueItem) => {
    // Skip if already pre-generating, ready, or not TTS
    if (item.source !== "tts" || item.status === "ready" || item.audioUrl) return
    if (preGeneratingRef.current.has(item.id)) return

    preGeneratingRef.current.add(item.id)

    try {
      // Update item status to generating
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "generating" as const } : q))
      )

      // Poll for audio generation
      const pollForAudio = async (): Promise<{ audioUrl: string; duration?: number }> => {
        const response = await api.entries.audio(item.entryId)
        if (response.status === "ready" && response.audio_url) {
          return { audioUrl: response.audio_url, duration: response.duration }
        }
        // Wait and try again
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL))
        return pollForAudio()
      }

      const result = await pollForAudio()

      // Update item with audio URL
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? { ...q, status: "ready" as const, audioUrl: result.audioUrl, duration: result.duration }
            : q
        )
      )
    } catch (err) {
      console.warn("Pre-generation failed:", err)
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "error" as const } : q))
      )
    } finally {
      preGeneratingRef.current.delete(item.id)
    }
  }, [])

  // Helper to play a queue item by index
  const playQueueItem = useCallback((index: number) => {
    if (index < 0 || index >= queue.length) return

    const item = queue[index]
    setCurrentQueueIndex(index)

    if (item.source === "tts") {
      requestTtsAudio(item.entryId, item.entryTitle, item.feedTitle)
    } else if (item.source === "podcast" && item.audioUrl) {
      requestPodcastAudio(item.entryId, item.entryTitle, item.audioUrl, item.feedTitle, item.duration)
    }

    // Pre-generate next item if it exists and is TTS
    const nextIndex = index + 1
    if (nextIndex < queue.length) {
      const nextItem = queue[nextIndex]
      if (nextItem.source === "tts" && nextItem.status === "pending") {
        preGenerateQueueItem(nextItem)
      }
    }
  }, [queue, requestTtsAudio, requestPodcastAudio, preGenerateQueueItem])

  // Skip to next item in queue
  const skipToNext = useCallback(() => {
    const nextIndex = currentQueueIndex + 1
    if (nextIndex < queue.length) {
      playQueueItem(nextIndex)
    } else {
      // End of queue
      reset()
      setCurrentQueueIndex(-1)
    }
  }, [currentQueueIndex, queue.length, playQueueItem, reset])

  // Keep ref updated for use in audio event handlers
  useEffect(() => {
    skipToNextRef.current = skipToNext
  }, [skipToNext])

  // Skip to previous item in queue
  const skipToPrevious = useCallback(() => {
    // If we're more than 3 seconds in, restart current. Otherwise go to previous
    if (currentTime > 3 && audioRef.current) {
      audioRef.current.currentTime = 0
      setCurrentTime(0)
      return
    }

    const prevIndex = currentQueueIndex - 1
    if (prevIndex >= 0) {
      playQueueItem(prevIndex)
    }
  }, [currentQueueIndex, currentTime, playQueueItem])

  // Add item to end of queue
  const addToQueue = useCallback((input: QueueItemInput) => {
    const newItem: QueueItem = {
      ...input,
      id: generateUUID(),
      status: input.source === "podcast" ? "ready" : "pending",
    }

    // Check if queue is empty and nothing is playing
    const shouldAutoPlay = queue.length === 0 && state === "idle"

    setQueue((prev) => [...prev, newItem])
    setIsVisible(true) // Show audio panel when adding to queue

    // Auto-play first item if nothing is playing
    if (shouldAutoPlay) {
      setCurrentQueueIndex(0)
      if (newItem.source === "tts") {
        requestTtsAudio(newItem.entryId, newItem.entryTitle, newItem.feedTitle)
      } else if (newItem.source === "podcast" && newItem.audioUrl) {
        requestPodcastAudio(newItem.entryId, newItem.entryTitle, newItem.audioUrl, newItem.feedTitle, newItem.duration)
      }
    }
  }, [queue.length, state, requestTtsAudio, requestPodcastAudio])

  // Play item immediately (insert at current position and play)
  const playNow = useCallback((input: QueueItemInput) => {
    const newItem: QueueItem = {
      ...input,
      id: generateUUID(),
      status: input.source === "podcast" ? "ready" : "pending",
    }

    // Insert at current position + 1 (or at 0 if nothing playing)
    const insertIndex = currentQueueIndex >= 0 ? currentQueueIndex + 1 : 0
    setQueue((prev) => {
      const newQueue = [...prev]
      newQueue.splice(insertIndex, 0, newItem)
      return newQueue
    })

    // Play the newly inserted item
    setCurrentQueueIndex(insertIndex)
    if (newItem.source === "tts") {
      requestTtsAudio(newItem.entryId, newItem.entryTitle, newItem.feedTitle)
    } else if (newItem.source === "podcast" && newItem.audioUrl) {
      requestPodcastAudio(newItem.entryId, newItem.entryTitle, newItem.audioUrl, newItem.feedTitle, newItem.duration)
    }
  }, [currentQueueIndex, requestTtsAudio, requestPodcastAudio])

  // Remove item from queue
  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => {
      const index = prev.findIndex((item) => item.id === id)
      if (index === -1) return prev

      // Adjust current index if needed
      if (index < currentQueueIndex) {
        setCurrentQueueIndex((curr) => curr - 1)
      } else if (index === currentQueueIndex) {
        // Removing currently playing item - skip to next or stop
        skipToNext()
      }

      return prev.filter((item) => item.id !== id)
    })
  }, [currentQueueIndex, skipToNext])

  // Clear entire queue
  const clearQueue = useCallback(() => {
    reset()
    setQueue([])
    setCurrentQueueIndex(-1)
  }, [reset])

  // Reorder queue (for drag and drop)
  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    setQueue((prev) => {
      const newQueue = [...prev]
      const [removed] = newQueue.splice(fromIndex, 1)
      newQueue.splice(toIndex, 0, removed)

      // Adjust current index if needed
      if (currentQueueIndex === fromIndex) {
        setCurrentQueueIndex(toIndex)
      } else if (fromIndex < currentQueueIndex && toIndex >= currentQueueIndex) {
        setCurrentQueueIndex((curr) => curr - 1)
      } else if (fromIndex > currentQueueIndex && toIndex <= currentQueueIndex) {
        setCurrentQueueIndex((curr) => curr + 1)
      }

      return newQueue
    })
  }, [currentQueueIndex])

  // Pre-generate TTS for upcoming items
  useEffect(() => {
    const preGenerate = async (item: QueueItem) => {
      if (preGeneratingRef.current.has(item.id)) return
      preGeneratingRef.current.add(item.id)

      try {
        const response = await api.entries.audio(item.entryId)
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: response.status === "ready" ? "ready" : "generating" }
              : q
          )
        )

        // If generating, poll for completion
        if (response.status === "generating") {
          const pollForReady = async () => {
            const pollResponse = await api.entries.audio(item.entryId)
            if (pollResponse.status === "ready") {
              setQueue((prev) =>
                prev.map((q) =>
                  q.id === item.id ? { ...q, status: "ready" } : q
                )
              )
            } else {
              // Keep polling
              setTimeout(pollForReady, POLL_INTERVAL)
            }
          }
          setTimeout(pollForReady, POLL_INTERVAL)
        }
      } catch {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: "error" } : q
          )
        )
      }
    }

    // Pre-generate for items at currentQueueIndex + 1 and + 2
    const indicesToPreGen = [currentQueueIndex + 1, currentQueueIndex + 2]
    for (const idx of indicesToPreGen) {
      if (idx >= 0 && idx < queue.length) {
        const item = queue[idx]
        if (item.source === "tts" && item.status === "pending") {
          preGenerate(item)
        }
      }
    }
  }, [queue, currentQueueIndex])

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
    // Queue state
    queue,
    currentQueueIndex,
    isQueuePanelOpen,
    // Controls
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
    // Queue controls
    addToQueue,
    playNow,
    removeFromQueue,
    clearQueue,
    skipToNext,
    skipToPrevious,
    reorderQueue,
    playQueueItem,
    toggleQueuePanel,
    // Audio requests
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
