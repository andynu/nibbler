import { Download, FileAudio, FileVideo, Image as ImageIcon, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Enclosure } from "@/lib/api"

interface EnclosurePlayerProps {
  enclosures: Enclosure[]
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

function AudioPlayer({ enclosure }: { enclosure: Enclosure }) {
  const duration = formatDuration(enclosure.duration)

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
      <audio
        controls
        preload="metadata"
        className="w-full h-10"
        src={enclosure.content_url}
        data-testid="audio-player"
      >
        <a href={enclosure.content_url}>Download audio</a>
      </audio>
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

export function EnclosurePlayer({ enclosures }: EnclosurePlayerProps) {
  if (!enclosures || enclosures.length === 0) return null

  return (
    <div className="space-y-3 my-4">
      {enclosures.map((enclosure) => {
        const mediaType = getMediaType(enclosure.content_type)

        switch (mediaType) {
          case "audio":
            return <AudioPlayer key={enclosure.id} enclosure={enclosure} />
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
