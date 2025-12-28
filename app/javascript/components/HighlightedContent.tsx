import { useEffect, useRef, useMemo, useCallback } from "react"
import type { WordTimestamp } from "@/lib/api"

interface HighlightedContentProps {
  html: string
  timestamps: WordTimestamp[]
  currentWordIndex: number
  isPlaying: boolean
  autoScroll?: boolean
  onUserScroll?: () => void
  className?: string
}

/**
 * Renders HTML content with word highlighting synchronized to TTS playback.
 *
 * The challenge: timestamps are for plain text, but we render HTML.
 * Approach: Extract text content, build a word-to-position map, then use
 * CSS classes to highlight the matching text spans.
 *
 * Note: Content is sanitized server-side before storage, matching the
 * existing EntryContent component's approach.
 */
export function HighlightedContent({
  html,
  timestamps,
  currentWordIndex,
  isPlaying,
  autoScroll = false,
  onUserScroll,
  className,
}: HighlightedContentProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isAutoScrollingRef = useRef(false)
  const lastScrollTimeRef = useRef(0)

  // Extract plain text and build word position map
  const { processedHtml, wordCount } = useMemo(() => {
    if (!timestamps.length) {
      // No timestamps - just return original HTML
      return { processedHtml: html, wordCount: 0 }
    }

    // Parse HTML and wrap words with spans for highlighting
    const doc = new DOMParser().parseFromString(html, "text/html")
    let wordIndex = 0

    // Walk through all text nodes and wrap words
    const walker = document.createTreeWalker(
      doc.body,
      NodeFilter.SHOW_TEXT,
      null
    )

    const nodesToProcess: Array<{ node: Text; parent: Node }> = []
    let node: Text | null
    while ((node = walker.nextNode() as Text | null)) {
      if (node.textContent && node.textContent.trim()) {
        nodesToProcess.push({ node, parent: node.parentNode! })
      }
    }

    for (const { node, parent } of nodesToProcess) {
      const text = node.textContent || ""
      // Split into words while preserving whitespace
      const parts = text.split(/(\s+)/)
      const fragment = doc.createDocumentFragment()

      for (const part of parts) {
        if (/^\s+$/.test(part)) {
          // Whitespace - add as text node
          fragment.appendChild(doc.createTextNode(part))
        } else if (part) {
          // Word - wrap in span
          const span = doc.createElement("span")
          span.textContent = part
          span.setAttribute("data-word-index", String(wordIndex))
          span.className = "tts-word"
          fragment.appendChild(span)
          wordIndex++
        }
      }

      parent.replaceChild(fragment, node)
    }

    return {
      processedHtml: doc.body.innerHTML,
      wordCount: wordIndex,
    }
  }, [html, timestamps.length])

  // Detect user scroll (to pause auto-scroll)
  const handleScroll = useCallback(() => {
    // Ignore scroll events triggered by our auto-scroll
    if (isAutoScrollingRef.current) return

    // Debounce: only trigger if not recently auto-scrolled
    const now = Date.now()
    if (now - lastScrollTimeRef.current < 100) return

    onUserScroll?.()
  }, [onUserScroll])

  // Update highlighting when current word changes
  useEffect(() => {
    if (!containerRef.current || !timestamps.length) return

    // Remove previous highlight
    const prevHighlight = containerRef.current.querySelector(".tts-word-active")
    if (prevHighlight) {
      prevHighlight.classList.remove("tts-word-active")
    }

    // Add new highlight and scroll into view
    if (currentWordIndex >= 0 && isPlaying) {
      const currentSpan = containerRef.current.querySelector(
        `[data-word-index="${currentWordIndex}"]`
      )
      if (currentSpan) {
        currentSpan.classList.add("tts-word-active")

        // Auto-scroll to keep highlighted word visible
        if (autoScroll) {
          isAutoScrollingRef.current = true
          lastScrollTimeRef.current = Date.now()

          currentSpan.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          })

          // Reset auto-scroll flag after animation completes
          setTimeout(() => {
            isAutoScrollingRef.current = false
          }, 500)
        }
      }
    }
  }, [currentWordIndex, isPlaying, timestamps.length, autoScroll])

  // Content is sanitized server-side before storage
  return (
    <div
      ref={containerRef}
      className={className}
      onScroll={handleScroll}
      dangerouslySetInnerHTML={{ __html: processedHtml }}
    />
  )
}
