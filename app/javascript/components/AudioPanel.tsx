import { X, Play, Pause, Square, Loader2, MousePointerClick, LocateFixed } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAudioPlayer } from "@/contexts/AudioPlayerContext"
import { cn } from "@/lib/utils"

const SPEED_OPTIONS = [1, 1.25, 1.5, 1.75, 2]

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export function AudioPanel() {
  const {
    state,
    source,
    currentTime,
    duration,
    autoScroll,
    playbackSpeed,
    isVisible,
    activeEntryTitle,
    activeFeedTitle,
    play,
    pause,
    stop,
    seek,
    toggleAutoScroll,
    setPlaybackSpeed,
    dismiss,
    jumpToSource,
    onJumpToEntry,
    error,
  } = useAudioPlayer()

  if (!isVisible) {
    return null
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const isLoading = state === "loading" || state === "generating"
  const isPlayable = state === "ready" || state === "playing" || state === "paused"
  const isError = state === "error"

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50",
        "h-14 px-4",
        "bg-background border-t border-border",
        "flex items-center gap-4",
        "transition-transform duration-200 ease-out",
        isVisible ? "translate-y-0" : "translate-y-full"
      )}
    >
      {/* Loading/generating state */}
      {isLoading && (
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">
            {state === "loading" ? "Loading..." : "Generating audio..."}
          </span>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex items-center gap-3 text-destructive">
          <span className="text-sm">{error || "Audio error"}</span>
        </div>
      )}

      {/* Playback controls */}
      {isPlayable && (
        <>
          {/* Play/Pause button */}
          {state === "playing" ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={pause}
              className="h-9 w-9 shrink-0"
              aria-label="Pause"
            >
              <Pause className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={play}
              className="h-9 w-9 shrink-0"
              aria-label="Play"
            >
              <Play className="h-5 w-5" />
            </Button>
          )}

          {/* Entry title and feed title */}
          <div className="hidden sm:flex flex-col min-w-0 max-w-48 shrink-0">
            {activeEntryTitle && (
              <div className="truncate text-sm font-medium" title={activeEntryTitle}>
                {activeEntryTitle}
              </div>
            )}
            {activeFeedTitle && (
              <div className="truncate text-xs text-muted-foreground" title={activeFeedTitle}>
                {activeFeedTitle}
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <div
              className="flex-1 h-1.5 bg-muted rounded-full cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const percent = (e.clientX - rect.left) / rect.width
                seek(percent * duration)
              }}
              role="slider"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={currentTime}
              aria-label="Playback progress"
              tabIndex={0}
            >
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Speed control */}
          <select
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
            className="h-7 px-1.5 text-xs bg-background border border-border rounded cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary shrink-0"
            aria-label="Playback speed"
            title="Playback speed"
          >
            {SPEED_OPTIONS.map((speed) => (
              <option key={speed} value={speed}>
                {speed}x
              </option>
            ))}
          </select>

          {/* Auto-scroll toggle (TTS only) */}
          {source === "tts" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleAutoScroll}
              className="h-8 w-8 shrink-0"
              aria-label={autoScroll ? "Disable auto-scroll" : "Enable auto-scroll"}
              title={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}
            >
              <MousePointerClick
                className={cn("h-4 w-4", autoScroll ? "text-primary" : "text-muted-foreground")}
              />
            </Button>
          )}

          {/* Jump to source button */}
          {onJumpToEntry && (
            <Button
              variant="ghost"
              size="icon"
              onClick={jumpToSource}
              className="h-8 w-8 shrink-0"
              aria-label="Go to playing item"
              title="Go to playing item"
            >
              <LocateFixed className="h-4 w-4" />
            </Button>
          )}

          {/* Stop button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={stop}
            className="h-8 w-8 shrink-0"
            aria-label="Stop"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        </>
      )}

      {/* Close button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={dismiss}
        className="h-9 w-9 ml-auto"
        aria-label="Close audio panel"
      >
        <X className="h-5 w-5" />
      </Button>
    </div>
  )
}
