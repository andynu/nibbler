import { Download, FileAudio, FileVideo, Image as ImageIcon, ExternalLink, Play, Pause, Headphones, ListPlus, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAudioPlayer } from "@/contexts/AudioPlayerContext"
import type { Enclosure } from "@/lib/api"

interface EnclosurePlayerProps {
  enclosures: Enclosure[]
  entryId?: number
  entryTitle?: string
  feedTitle?: string
}

function formatDuration(duration: string): string {
  if (!duration || duration === "0" || duration === "") return ""

  const seconds = parseInt(duration, 10)
  if (isNaN(seconds)) return duration

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`
}

function getMediaType(contentType: string): "audio" | "video" | "image" | "other" {
  if (contentType.startsWith("audio/")) return "audio"
  if (contentType.startsWith("video/")) return "video"
  if (contentType.startsWith("image/")) return "image"
  return "other"
}

interface AudioPlayerInternalProps {
  enclosure: Enclosure
  entryId?: number
  entryTitle?: string
  feedTitle?: string
}

function AudioPlayer({ enclosure, entryId, entryTitle, feedTitle }: AudioPlayerInternalProps) {
  const audioPlayer = useAudioPlayer()
  const duration = formatDuration(enclosure.duration)
  const durationSeconds = enclosure.duration ? parseInt(enclosure.duration, 10) : undefined

  // Check if this enclosure is currently playing in the audio panel
  const isPlayingInPanel = audioPlayer.source === "podcast" &&
    audioPlayer.activeEntryId === entryId &&
    audioPlayer.state !== "idle"

  const handleTogglePlayback = () => {
    if (audioPlayer.state === "playing") {
      audioPlayer.pause()
    } else {
      audioPlayer.play()
    }
  }

  const handlePlayNow = () => {
    if (entryId && entryTitle) {
      audioPlayer.playNow({
        entryId,
        entryTitle: enclosure.title || entryTitle,
        feedTitle,
        source: "podcast",
        audioUrl: enclosure.content_url,
        duration: durationSeconds,
      })
    }
  }

  const handleAddToQueue = () => {
    if (entryId && entryTitle) {
      audioPlayer.addToQueue({
        entryId,
        entryTitle: enclosure.title || entryTitle,
        feedTitle,
        source: "podcast",
        audioUrl: enclosure.content_url,
        duration: durationSeconds,
      })
    }
  }

  return (
    <div className="bg-muted rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <FileAudio className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium truncate flex-1">
          {enclosure.title || "Audio"}
        </span>
        {duration && (
          <span className="text-xs text-muted-foreground">{duration}</span>
        )}
        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
          <a href={enclosure.content_url} download aria-label="Download">
            <Download className="h-4 w-4" />
          </a>
        </Button>
      </div>
      {/* Show play button that integrates with audio panel, or native controls as fallback */}
      {entryId && entryTitle ? (
        <div className="flex items-center gap-2">
          {isPlayingInPanel ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTogglePlayback}
                className="gap-2"
              >
                {audioPlayer.state === "playing" ? (
                  <>
                    <Pause className="h-4 w-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Resume
                  </>
                )}
              </Button>
              <span className="text-xs text-muted-foreground">
                Playing in audio panel
              </span>
            </>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Headphones className="h-4 w-4" />
                  Listen
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={handlePlayNow}>
                  <Play className="h-4 w-4 mr-2" />
                  Play now
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleAddToQueue}>
                  <ListPlus className="h-4 w-4 mr-2" />
                  Add to queue
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ) : (
        <audio
          controls
          preload="metadata"
          className="w-full h-10"
          src={enclosure.content_url}
          data-testid="audio-player"
        >
          <a href={enclosure.content_url}>Download audio</a>
        </audio>
      )}
    </div>
  )
}

function VideoPlayer({ enclosure }: { enclosure: Enclosure }) {
  const duration = formatDuration(enclosure.duration)

  return (
    <div className="bg-muted rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <FileVideo className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium truncate flex-1">
          {enclosure.title || "Video"}
        </span>
        {duration && (
          <span className="text-xs text-muted-foreground">{duration}</span>
        )}
        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
          <a href={enclosure.content_url} download aria-label="Download">
            <Download className="h-4 w-4" />
          </a>
        </Button>
      </div>
      <video
        controls
        preload="metadata"
        className="w-full max-h-[400px] rounded"
        src={enclosure.content_url}
        width={enclosure.width || undefined}
        height={enclosure.height || undefined}
        data-testid="video-player"
      >
        <a href={enclosure.content_url}>Download video</a>
      </video>
    </div>
  )
}

function ImageDisplay({ enclosure }: { enclosure: Enclosure }) {
  return (
    <div className="bg-muted rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium truncate flex-1">
          {enclosure.title || "Image"}
        </span>
        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
          <a href={enclosure.content_url} target="_blank" rel="noopener noreferrer" aria-label="Open full size">
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
          <a href={enclosure.content_url} download aria-label="Download">
            <Download className="h-4 w-4" />
          </a>
        </Button>
      </div>
      <a href={enclosure.content_url} target="_blank" rel="noopener noreferrer">
        <img
          src={enclosure.content_url}
          alt={enclosure.title || "Enclosure image"}
          className="max-w-full h-auto rounded"
          loading="lazy"
        />
      </a>
    </div>
  )
}

function OtherEnclosure({ enclosure }: { enclosure: Enclosure }) {
  return (
    <div className="bg-muted rounded-lg p-3 flex items-center gap-3">
      <Download className="h-5 w-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {enclosure.title || "Attachment"}
        </div>
        <div className="text-xs text-muted-foreground">
          {enclosure.content_type}
        </div>
      </div>
      <Button variant="outline" size="sm" asChild>
        <a href={enclosure.content_url} download>
          Download
        </a>
      </Button>
    </div>
  )
}

export function EnclosurePlayer({ enclosures, entryId, entryTitle, feedTitle }: EnclosurePlayerProps) {
  if (!enclosures || enclosures.length === 0) return null

  return (
    <div className="space-y-3 my-4">
      {enclosures.map((enclosure) => {
        const mediaType = getMediaType(enclosure.content_type)

        switch (mediaType) {
          case "audio":
            return <AudioPlayer key={enclosure.id} enclosure={enclosure} entryId={entryId} entryTitle={entryTitle} feedTitle={feedTitle} />
          case "video":
            return <VideoPlayer key={enclosure.id} enclosure={enclosure} />
          case "image":
            return <ImageDisplay key={enclosure.id} enclosure={enclosure} />
          default:
            return <OtherEnclosure key={enclosure.id} enclosure={enclosure} />
        }
      })}
    </div>
  )
}
