import { useMemo } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Star, Circle, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePreferences } from "@/contexts/PreferencesContext"
import { EnclosurePlayer } from "@/components/EnclosurePlayer"
import type { Entry } from "@/lib/api"

interface EntryContentProps {
  entry: Entry | null
  onToggleRead: () => void
  onToggleStarred: () => void
  onPrevious: () => void
  onNext: () => void
  hasPrevious: boolean
  hasNext: boolean
  isLoading: boolean
  scrollViewportRef?: React.RefObject<HTMLDivElement | null>
}

function stripImages(html: string): string {
  // Remove img tags from HTML content
  return html.replace(/<img[^>]*>/gi, "")
}

export function EntryContent({
  entry,
  onToggleRead,
  onToggleStarred,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  isLoading,
  scrollViewportRef,
}: EntryContentProps) {
  const { preferences } = usePreferences()
  const shouldStripImages = preferences.strip_images === "true"

  const processedContent = useMemo(() => {
    if (!entry?.content) return ""
    return shouldStripImages ? stripImages(entry.content) : entry.content
  }, [entry?.content, shouldStripImages])

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    )
  }

  if (!entry) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Select an entry to read
      </div>
    )
  }

  const publishedDate = new Date(entry.published)
  const formattedDate = publishedDate.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <div className="h-full flex flex-col">
      <div className="h-12 px-3 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onPrevious} disabled={!hasPrevious}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onNext} disabled={!hasNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onToggleRead}>
            <Circle
              className="h-4 w-4"
              style={entry.unread ? {
                fill: "var(--color-accent-secondary)",
                color: "var(--color-accent-secondary)",
              } : undefined}
            />
          </Button>
          <Button variant="ghost" size="icon" onClick={onToggleStarred}>
            <Star
              className="h-4 w-4"
              style={entry.starred ? {
                fill: "var(--color-accent-secondary)",
                color: "var(--color-accent-secondary)",
              } : undefined}
            />
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <a href={entry.link} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0" viewportRef={scrollViewportRef}>
        <article className="max-w-3xl mx-auto p-6">
          <header className="mb-6">
            <h1 className="text-2xl font-bold mb-2">
              <a
                href={entry.link}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                {entry.title}
              </a>
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {entry.feed_title && <span>{entry.feed_title}</span>}
              {entry.author && (
                <>
                  <span>·</span>
                  <span>{entry.author}</span>
                </>
              )}
              <span>·</span>
              <time dateTime={entry.published}>{formattedDate}</time>
            </div>
            {entry.labels && entry.labels.length > 0 && (
              <div className="flex gap-1 mt-2">
                {entry.labels.map((label) => (
                  <Badge
                    key={label.id}
                    style={{
                      backgroundColor: label.bg_color,
                      color: label.fg_color,
                    }}
                  >
                    {label.caption}
                  </Badge>
                ))}
              </div>
            )}
            {entry.tags && entry.tags.length > 0 && (
              <div className="flex gap-1 mt-2">
                {entry.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </header>

          {entry.enclosures && entry.enclosures.length > 0 && (
            <EnclosurePlayer enclosures={entry.enclosures} />
          )}

          <div
            className="prose prose-sm max-w-none
              [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3
              [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-2
              [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2
              [&_p]:my-3 [&_p]:leading-relaxed
              [&_ul]:my-3 [&_ul]:pl-6 [&_ul]:list-disc
              [&_ol]:my-3 [&_ol]:pl-6 [&_ol]:list-decimal
              [&_li]:my-1
              [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4
              [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-4
              [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-sm
              [&_a]:text-primary [&_a]:underline
              [&_img]:max-w-full [&_img]:h-auto [&_img]:my-4 [&_img]:rounded"
            dangerouslySetInnerHTML={{ __html: processedContent }}
          />

          {entry.note && (
            <div className="mt-6 p-4 bg-muted rounded-md">
              <div className="text-sm font-medium mb-1">Note</div>
              <div className="text-sm">{entry.note}</div>
            </div>
          )}
        </article>
      </ScrollArea>
    </div>
  )
}
