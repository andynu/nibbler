import { Play, Pause, Square, Loader2, Volume2, MousePointerClick } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { TtsState } from "@/hooks/useTtsPlayer"

interface TtsPlayerProps {
  state: TtsState
  currentTime: number
  duration: number
  autoScroll?: boolean
  playbackSpeed?: number
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onSeek: (time: number) => void
  onToggleAutoScroll?: () => void
  onSetPlaybackSpeed?: (speed: number) => void
  onRequestAudio: () => void
  error?: string | null
  className?: string
}

const SPEED_OPTIONS = [1, 1.25, 1.5, 1.75, 2]

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export function TtsPlayer({
  state,
  currentTime,
  duration,
  autoScroll = true,
  playbackSpeed = 1,
  onPlay,
  onPause,
  onStop,
  onSeek,
  onToggleAutoScroll,
  onSetPlaybackSpeed,
  onRequestAudio,
  error,
  className,
}: TtsPlayerProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  // Idle state - show Listen button
  if (state === "idle") {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onRequestAudio}
        className={cn("gap-2", className)}
      >
        <Volume2 className="h-4 w-4" />
        Listen
      </Button>
    )
  }

  // Error state
  if (state === "error") {
    return (
      <div className={cn("flex items-center gap-2 text-destructive text-sm", className)}>
        <Volume2 className="h-4 w-4" />
        <span>{error || "Audio error"}</span>
        <Button variant="outline" size="sm" onClick={onRequestAudio}>
          Retry
        </Button>
      </div>
    )
  }

  // Loading/generating state
  if (state === "loading" || state === "generating") {
    return (
      <div className={cn("flex items-center gap-2 text-muted-foreground text-sm", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{state === "loading" ? "Loading..." : "Generating audio..."}</span>
      </div>
    )
  }

  // Ready/playing/paused state - show full player
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Play/Pause button */}
      {state === "playing" ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={onPause}
          className="h-8 w-8"
          aria-label="Pause"
        >
          <Pause className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={onPlay}
          className="h-8 w-8"
          aria-label="Play"
        >
          <Play className="h-4 w-4" />
        </Button>
      )}

      {/* Stop button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onStop}
        className="h-8 w-8"
        aria-label="Stop"
      >
        <Square className="h-3 w-3" />
      </Button>

      {/* Auto-scroll toggle */}
      {onToggleAutoScroll && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleAutoScroll}
          className="h-8 w-8"
          aria-label={autoScroll ? "Disable auto-scroll" : "Enable auto-scroll"}
          title={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}
        >
          <MousePointerClick
            className={cn("h-4 w-4", autoScroll ? "text-primary" : "text-muted-foreground")}
          />
        </Button>
      )}

      {/* Speed control */}
      {onSetPlaybackSpeed && (
        <select
          value={playbackSpeed}
          onChange={(e) => onSetPlaybackSpeed(parseFloat(e.target.value))}
          className="h-7 px-1.5 text-xs bg-background border border-border rounded cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
          aria-label="Playback speed"
          title="Playback speed"
        >
          {SPEED_OPTIONS.map((speed) => (
            <option key={speed} value={speed}>
              {speed}x
            </option>
          ))}
        </select>
      )}

      {/* Progress bar */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <span className="text-xs text-muted-foreground tabular-nums w-10">
          {formatTime(currentTime)}
        </span>
        <div
          className="flex-1 h-1.5 bg-muted rounded-full cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const percent = (e.clientX - rect.left) / rect.width
            onSeek(percent * duration)
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
        <span className="text-xs text-muted-foreground tabular-nums w-10">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  )
}
