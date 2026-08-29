import { useEffect, useState } from "react"
import { api } from "@/lib/api"

export interface EmbedPolicyState {
  /** True only once the origin server has said it refuses a third-party frame. */
  blocked: boolean
  /** The header that refused, for the fallback panel and the console. */
  reason: string | null
}

export interface UseEmbedPolicyOptions {
  /** The user_entry id, or null when nothing is selected. */
  entryId: number | null
  /** False whenever no iframe is on screen; nothing is asked then. */
  enabled: boolean
}

/**
 * Whether the entry's page refuses to be framed.
 *
 * A browser tells the embedder nothing about a refused frame. A page blocked by
 * X-Frame-Options or by a CSP frame-ancestors directive fires `load` on the
 * iframe element, never `error`, and the refusal document commits on the
 * target's origin, so the parent sees the same opaque cross-origin frame it
 * sees for a page that loaded. Verified in Chromium 151 and Firefox 153; the
 * only trace is a console message no script can read. An `onError` handler on
 * the iframe is dead code, which is what left the reader staring at a blank
 * white frame (ttrb-watz).
 *
 * So the server reads the page's headers instead, and this asks it.
 *
 * The answer is not waited for. The frame is mounted immediately and swapped
 * for the fallback if the probe comes back "blocked", because delaying every
 * article to rule out the minority that refuse would be the worse trade.
 */
export function useEmbedPolicy({ entryId, enabled }: UseEmbedPolicyOptions): EmbedPolicyState {
  const [state, setState] = useState<EmbedPolicyState>({ blocked: false, reason: null })

  useEffect(() => {
    setState({ blocked: false, reason: null })
    if (!enabled || entryId === null) return

    let current = true

    api.entries
      .embedPolicy(entryId)
      .then((policy) => {
        if (!current) return
        setState({ blocked: policy.status === "blocked", reason: policy.reason })
      })
      .catch(() => {
        // A probe that could not reach the site says nothing about whether the
        // reader's own browser can. Leave the frame up rather than replace a
        // page that may well render with an apology for it.
      })

    return () => {
      current = false
    }
  }, [entryId, enabled])

  return state
}
