import { X, Play, Pause, Loader2, MousePointerClick, LocateFixed, SkipBack, SkipForward, ListMusic, Bot, Headphones } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAudioPlayer } from "@/contexts/AudioPlayerContext"
import { QueuePanel } from "@/components/QueuePanel"
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
    queue,
    currentQueueIndex,
    play,
    pause,
    seek,
    toggleAutoScroll,
    setPlaybackSpeed,
    dismiss,
    jumpToSource,
    onJumpToEntry,
    skipToNext,
    skipToPrevious,
    toggleQueuePanel,
    playQueueItem,
    error,
  } = useAudioPlayer()

  if (!isVisible) {
    return null
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const isLoading = state === "loading" || state === "generating"
  const isPlayable = state === "ready" || state === "playing" || state === "paused"
  const isError = state === "error"
  const isIdleWithQueue = state === "idle" && queue.length > 0
  const hasNext = currentQueueIndex < queue.length - 1
  const hasPrevious = currentQueueIndex > 0 || currentTime > 3

  return (
    <>
      {/* Queue panel slides up above the audio panel */}
      <QueuePanel />

      {/* The bar's place and size come from the variables in
          application.tailwind.css rather than from a `bottom-0` and an `h-14`
          here, because on a phone it has to sit on top of MobileNavBar instead
          of over it, and because application.tsx has to deduct exactly this
          much from the main row. Box sizing is border-box, so the declared
          height covers the top border and the safe-area padding and leaves the
          controls their 56px row. See ttrb-8k7e. */}
      <div
        data-testid="audio-panel"
        style={{
          bottom: "var(--audio-panel-bottom)",
          height: "var(--audio-panel-height)",
          paddingBottom: "var(--audio-panel-inset)",
        }}
        className={cn(
          "fixed left-0 right-0 z-50",
          "px-4",
          "bg-background border-t border-border",
          "flex items-center gap-2 sm:gap-4",
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
          <div className="flex items-center gap-3 text-destructive-text">
            <span className="text-sm">{error || "Audio error"}</span>
          </div>
        )}

        {/* Idle with queue - show play from queue button */}
        {isIdleWithQueue && (
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => playQueueItem(0)}
              className="h-9 w-9 shrink-0"
              aria-label="Play from queue"
            >
              <Play className="h-5 w-5" />
            </Button>
            <div className="flex flex-col min-w-0">
              <span className="text-sm truncate">{queue[0]?.entryTitle}</span>
              <span className="text-xs text-muted-foreground">
                {queue.length} {queue.length === 1 ? "item" : "items"} in queue
              </span>
            </div>
            {/* Queue button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleQueuePanel}
              className="h-8 w-8 shrink-0 relative"
              aria-label="Open queue"
              title={`Queue (${queue.length} items)`}
            >
              <ListMusic className="h-4 w-4" />
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                {queue.length}
              </span>
            </Button>
          </div>
        )}

        {/* Playback controls */}
        {isPlayable && (
          <>
            {/* Below xs the row carries only what a reader cannot get to
                anywhere else: play/pause, the seek bar, the queue and the
                close button. Everything shed here has another home.

                The arithmetic, measured in Chromium at 320x720 with a 60s clip
                (ttrb-6hxv). 320 less the panel's px-4 leaves 288. The source
                icon, the two skips, play/pause, queue and close are all
                shrink-0 and take 16+32+36+32+32+36 = 184; six 8px gaps take
                48. That leaves 56 for the whole progress group, and the
                elapsed/total readout wants 48 of it with 8 more for its gap -
                so the seek bar, the one flex child with nothing left to claim,
                resolved to 0px wide. Not narrow: absent, with no styling cue
                that a control was missing. 360 gave it 30px and 375 gave it
                45, which for a 40-minute podcast is 53 and 35 seconds per
                pixel.

                Shedding the icon and the two skips returns 104px of row, and
                the readout takes back the 10px it had been squeezed out of, so
                the bar measures 94 at 320, 134 at 360 and 149 at 375.

                Why these three. The source indicator speaks only through
                `title`, which a touch device never shows, and QueuePanel draws
                the same Bot/Headphones glyph on every row. Skip next is a tap
                on a later queue row; skip previous is a tap on an earlier one,
                and its restart sense is a drag of a seek bar that now has
                width. The queue button that reaches all of that stays on the
                row. Shrinking the controls instead was not an option: they are
                32-36px against ~44px of guidance already (ttrb-w0w6). */}

            {/* Source indicator */}
            <div className="hidden xs:block shrink-0 text-muted-foreground" title={source === "tts" ? "Text-to-speech" : "Podcast"}>
              {source === "tts" ? (
                <Bot className="h-4 w-4" />
              ) : (
                <Headphones className="h-4 w-4" />
              )}
            </div>

            {/* Skip previous */}
            <Button
              variant="ghost"
              size="icon"
              onClick={skipToPrevious}
              disabled={!hasPrevious}
              className="hidden xs:inline-flex h-8 w-8 shrink-0"
              aria-label="Previous"
              title="Previous (or restart)"
            >
              <SkipBack className="h-4 w-4" />
            </Button>

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

            {/* Skip next */}
            <Button
              variant="ghost"
              size="icon"
              onClick={skipToNext}
              disabled={!hasNext}
              className="hidden xs:inline-flex h-8 w-8 shrink-0"
              aria-label="Next"
              title="Next in queue"
            >
              <SkipForward className="h-4 w-4" />
            </Button>

            {/* Entry title and feed title.

                md rather than sm, and shrinkable rather than shrink-0, because
                640 is where the seek bar collapsed a second time. Measured
                unfixed at 640x720: the four sm controls arrive all at once and
                the row wants 617px inside 608, so the progress group resolved
                to 0 wide exactly as it did at 320, and the row spilled 9px
                past the panel with the close button 649px into a 640px box.
                scrollWidth read 640 throughout, so nothing caught it.

                Holding the title back to md gives the 640-767 band a 133px bar
                with no title; dropping shrink-0 gives the min-width below
                something to take from at 768, where the title returns and the
                row is 9px over again. The title is what yields because it is
                the one thing here built to truncate. */}
            <div className="hidden md:flex flex-col min-w-0 max-w-48">
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

            {/* Progress bar.

                The 128px floor is on this group rather than on the bar inside
                it. A min-width on the bar alone does not reserve the group any
                room: at 640 the group still resolved to 0 and the bar drew its
                64px straight over the speed control. Here it reserves 128,
                which leaves the bar 62px in the worst case and takes the
                difference from the title, and it is what makes the next
                control added to this row overflow the panel where the width
                example in e2e/audio-panel-narrow.spec.ts reads it rather than
                quietly finishing off the bar. 128 and not more because at 640
                with the jump-to-source button present the row has 23px of
                slack and nothing there can shrink. */}
            <div className="flex-1 flex items-center gap-2 min-w-32">
              {/* The padding is the hit area. The visible track is 6px tall
                  and used to be the whole clickable box as well, against the
                  ~24px the score buttons are already short of (ttrb-w0w6);
                  py-2.5 makes it 26px without touching the panel's own height,
                  which is `items-center` inside a 56px row. Horizontal
                  geometry is untouched, so the seek arithmetic below still
                  reads the full track width. */}
              <div
                className="flex-1 py-2.5 cursor-pointer"
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
                <div className="h-1.5 bg-muted rounded-full">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* Speed control */}
            <select
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
              className="hidden sm:block h-7 px-1.5 text-xs bg-background border border-border rounded cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary shrink-0"
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
                className="hidden sm:inline-flex h-8 w-8 shrink-0"
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
                className="hidden sm:inline-flex h-8 w-8 shrink-0"
                aria-label="Go to playing item"
                title="Go to playing item"
              >
                <LocateFixed className="h-4 w-4" />
              </Button>
            )}

            {/* Queue button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleQueuePanel}
              className="h-8 w-8 shrink-0 relative"
              aria-label="Open queue"
              title={`Queue (${queue.length} items)`}
            >
              <ListMusic className="h-4 w-4" />
              {queue.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                  {queue.length}
                </span>
              )}
            </Button>
          </>
        )}

        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={dismiss}
          className="h-9 w-9 ml-auto shrink-0"
          aria-label="Close audio panel"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
    </>
  )
}
