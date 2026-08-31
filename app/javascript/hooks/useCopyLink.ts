import { useCallback, useEffect, useRef, useState } from "react"

export type CopyLinkStatus = "idle" | "copied" | "error"

/** How long the confirmation stands before the indicator clears itself. */
export const COPY_LINK_FEEDBACK_MS = 2000

export interface CopyLink {
  status: CopyLinkStatus
  /** Resolves once the outcome is on screen; never rejects. */
  copy: (link: string | null | undefined) => Promise<void>
}

/**
 * Put a URL on the clipboard and say whether it landed.
 *
 * The two existing copy buttons (AccountPanel, ToolsPanel) flip a local
 * `copied` boolean and swallow the failure into console.error. That is
 * survivable for a button the reader is looking at and wrong for a keystroke:
 * a copy that silently failed and a copy that silently worked look identical,
 * and the failures here are not hypothetical.
 *
 *  - `navigator.clipboard` is absent entirely outside a secure context, which
 *    is plain http on any host but localhost/127.0.0.1. Reaching for
 *    `writeText` there throws a TypeError rather than rejecting.
 *  - `writeText` rejects when the document is not focused or the permission is
 *    refused.
 *
 * Both land on `error`, which the caller is expected to render. The status
 * clears itself after COPY_LINK_FEEDBACK_MS so the indicator does not become
 * permanent chrome, and the timer is dropped on unmount.
 */
export function useCopyLink(feedbackMs: number = COPY_LINK_FEEDBACK_MS): CopyLink {
  const [status, setStatus] = useState<CopyLinkStatus>("idle")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // A second copy inside the window restarts it rather than inheriting the
  // remainder of the first one's.
  const report = useCallback(
    (outcome: Exclude<CopyLinkStatus, "idle">) => {
      clearTimer()
      setStatus(outcome)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        setStatus("idle")
      }, feedbackMs)
    },
    [clearTimer, feedbackMs]
  )

  useEffect(() => clearTimer, [clearTimer])

  const copy = useCallback(
    async (link: string | null | undefined) => {
      if (!link) {
        report("error")
        return
      }

      const clipboard = navigator.clipboard
      if (!clipboard?.writeText) {
        console.error("Clipboard unavailable: this needs a secure context (https or localhost)")
        report("error")
        return
      }

      try {
        await clipboard.writeText(link)
        report("copied")
      } catch (err) {
        console.error("Failed to copy link:", err)
        report("error")
      }
    },
    [report]
  )

  return { status, copy }
}
