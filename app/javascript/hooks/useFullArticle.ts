import { useCallback, useEffect, useRef, useState } from "react"
import { api, type FullArticle } from "@/lib/api"

/** Where a fetch of the publisher's page has got to. */
export type FullArticleState = "idle" | "fetching" | "ready" | "unavailable"

export interface UseFullArticleResult {
  /** "idle" means nothing has been asked for and the reader may ask. */
  state: FullArticleState
  /** The publisher's copy of the article, once there is one. */
  content: string | null
  /** The one thing the reader is told when it did not work. */
  message: string | null
  /** Go and get it. A second press while one is in flight does nothing. */
  request: () => Promise<void>
}

export interface UseFullArticleOptions {
  /** The user_entry id, which is what every /api/v1/entries call takes. */
  id: number | null
  /** What came down with the article: a stored fetch, or null for neither. */
  initial?: FullArticle | null
}

/**
 * Said when the request itself did not complete -- the browser is offline, the
 * server answered 500. Deliberately the same sentence the server sends for a
 * publisher that refused: from where the reader sits the situation is identical,
 * and the article's own link is the thing to offer either way.
 */
const REQUEST_FAILED = "The full article could not be retrieved."

interface FullArticleStatus {
  state: FullArticleState
  content: string | null
  message: string | null
}

function initialStatus(full: FullArticle | null | undefined): FullArticleStatus {
  if (full?.status === "ready") {
    return { state: "ready", content: full.content, message: null }
  }

  if (full?.status === "unavailable") {
    return { state: "unavailable", content: null, message: full.message }
  }

  return { state: "idle", content: null, message: null }
}

const UNAVAILABLE: FullArticleStatus = { state: "unavailable", content: null, message: REQUEST_FAILED }

/**
 * Fetch the publisher's own copy of an article whose feed published an excerpt.
 *
 * There is no channel and no polling here, unlike useEntrySummary: the server
 * does one bounded HTTP request and answers with the result, so the promise is
 * the whole story. A fetch that already happened arrives with the article and is
 * shown without asking again, including a fetch that failed -- being told the
 * publisher's page could not be read beats pressing a button and waiting for a
 * request the server will not make.
 */
export function useFullArticle({ id, initial }: UseFullArticleOptions): UseFullArticleResult {
  const [status, setStatus] = useState<FullArticleStatus>(() => initialStatus(initial))

  // Mirrors the rendered state so `request` can refuse a second press in the
  // same tick: a setState updater does not run before the caller's next line,
  // so two clicks would otherwise both see "idle" and both POST.
  const stateRef = useRef<FullArticleState>(status.state)
  stateRef.current = status.state

  // Read inside the reset effect, which keys on the payload's content rather
  // than the object's identity so it does not re-run on every render.
  const initialRef = useRef(initial)
  initialRef.current = initial

  // The full article can arrive after the id does, when a list row is opened and
  // the full article payload is fetched second.
  const initialKey = initial ? `${initial.status}|${initial.fetched_at}` : ""

  useEffect(() => {
    setStatus(initialStatus(initialRef.current))
  }, [id, initialKey])

  const request = useCallback(async () => {
    if (id === null || stateRef.current === "fetching") return

    stateRef.current = "fetching"
    setStatus({ state: "fetching", content: null, message: null })

    try {
      const response = await api.entries.fullText(id)
      // The server always settles this request one way or the other, so a null
      // payload here is a server that did something unexpected rather than a
      // reader who may ask again. Reported as unavailable so the affordance does
      // not reset to a button that answered nothing.
      setStatus(response.full_text ? initialStatus(response.full_text) : UNAVAILABLE)
    } catch {
      // The server's own message is not available here, so the generic one
      // stands in. Nothing about the cause is guessed at, for the same reason
      // the server does not guess.
      setStatus(UNAVAILABLE)
    }
  }, [id])

  return { ...status, request }
}
