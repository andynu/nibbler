import { useCallback, useEffect, useState } from "react"

export interface ContentViewMode {
  /** True when the original page is shown in an iframe instead of the RSS content. */
  showIframe: boolean
  /** Flip between the RSS content and the iframe. Bound to the `i` key. */
  toggleIframe: () => void
}

/**
 * Which article body is on screen: the feed's RSS content or the original page
 * in an iframe.
 *
 * The stored `content_view_mode` preference supplies the starting value and is
 * re-applied when the reader changes it in settings. It is deliberately not
 * re-applied per entry: the `i` toggle is sticky for the session, so iframe view
 * can be turned on once and the list walked with j/k without every entry
 * snapping back to the stored default (ttrb-la5r).
 *
 * @param contentViewMode the stored preference, "iframe" or "rss"
 */
export function useContentViewMode(contentViewMode: string | undefined): ContentViewMode {
  const [showIframe, setShowIframe] = useState(contentViewMode === "iframe")

  // Preferences are fetched after the first render, so the stored mode arrives
  // as a change to this value rather than as the initial state.
  useEffect(() => {
    setShowIframe(contentViewMode === "iframe")
  }, [contentViewMode])

  const toggleIframe = useCallback(() => {
    setShowIframe((prev) => !prev)
  }, [])

  return { showIframe, toggleIframe }
}
