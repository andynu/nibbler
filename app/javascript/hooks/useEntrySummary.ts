import { useCallback, useEffect, useRef, useState } from "react"
import { api, type EntrySummary, type EntrySummaryState } from "@/lib/api"
import { useCableSubscription, type CableSubscriptionState } from "@/hooks/useCableSubscription"

/** One message on EntrySummaryChannel. Mirrors SummarizeEntryJob's broadcasts. */
export interface EntrySummaryMessage {
  entry_id: number
  state: Exclude<EntrySummaryState, "idle">
  summary?: EntrySummary
  message?: string
  content_length?: number
}

export interface EntrySummaryStatus {
  /** Where generation is. "idle" means nothing has been asked for. */
  state: EntrySummaryState
  /** The paragraph, once there is one. A stale summary is still here. */
  summary: EntrySummary | null
  /** Why generation stopped, for the failed, unavailable and too_short states. */
  message: string | null
  /** Length of the article's text, sent with "too_short" so the reason can be specific. */
  contentLength: number | null
}

export interface UseEntrySummaryResult extends EntrySummaryStatus {
  /** Ask for a summary. A second press while one is in flight does nothing. */
  request: () => Promise<void>
  /** The channel's own state, for telling "no result yet" from "no connection". */
  connection: CableSubscriptionState
}

export interface UseEntrySummaryOptions {
  /** The user_entry id, which is what every /api/v1/entries call takes. */
  id: number | null
  /**
   * The shared entry id, which is what the channel is keyed on. Summaries hang
   * off the Entry, so two readers of the same article watch one generation.
   */
  entryId: number | null
  /** A summary that came down with the article, shown without asking for it. */
  initialSummary?: EntrySummary | null
}

/**
 * How far through a generation each state is.
 *
 * Needed because two sources report the same run and they can arrive out of
 * order: the POST's reply travels over HTTP while "queued" and "running" travel
 * over the websocket, and the worker can start before Puma has finished writing
 * the response. Without an ordering, a late "queued" reply overwrites a
 * "running" that already arrived and the reader watches progress run backwards.
 * An update is applied only if it is at least as far along as what is already
 * shown; `request` is what starts a new run and resets this.
 */
const PROGRESS: Record<EntrySummaryState, number> = {
  idle: 0,
  queued: 1,
  running: 2,
  ready: 3,
  failed: 3,
  unavailable: 3,
  too_short: 3,
}

const IN_FLIGHT: EntrySummaryState[] = ["queued", "running"]

const REQUEST_FAILED = "The summary could not be requested."

function initialStatus(summary: EntrySummary | null | undefined): EntrySummaryStatus {
  return summary
    ? { state: "ready", summary, message: null, contentLength: null }
    : { state: "idle", summary: null, message: null, contentLength: null }
}

/**
 * Subscribe to one article's summary generation and expose a way to start it.
 *
 * The reader presses once; the paragraph arrives by broadcast with no polling.
 * A summary that already exists comes down with the article and is shown
 * immediately, so opening a summarized article costs no request and no model
 * time. Generation is only ever started by `request`.
 *
 * The subscription is refused by the server unless this user has a UserEntry for
 * `entryId`, so `connection` going to "rejected" means the entry is not theirs
 * rather than that the socket is down.
 */
export function useEntrySummary({
  id,
  entryId,
  initialSummary,
}: UseEntrySummaryOptions): UseEntrySummaryResult {
  const [status, setStatus] = useState<EntrySummaryStatus>(() => initialStatus(initialSummary))

  // Mirrors the rendered state so `request` can refuse a second press in the
  // same tick. Reading `status` in the callback would not do it: a setState
  // updater does not run before the caller's next line, so two clicks in one
  // tick would both see "idle" and both POST.
  const stateRef = useRef<EntrySummaryState>(status.state)
  stateRef.current = status.state

  // Read inside the reset effect, which keys on the summary's content rather
  // than the object's identity so it does not re-run on every render.
  const initialRef = useRef(initialSummary)
  initialRef.current = initialSummary

  // A cached summary can arrive after the entry id does, when a list row is
  // opened and the full article is fetched second.
  const initialKey = initialSummary
    ? `${initialSummary.generated_at}|${initialSummary.stale}`
    : ""

  useEffect(() => {
    setStatus(initialStatus(initialRef.current))
  }, [entryId, initialKey])

  const apply = useCallback((update: Partial<EntrySummaryStatus> & { state: EntrySummaryState }) => {
    setStatus((current) => {
      if (PROGRESS[update.state] < PROGRESS[current.state]) return current

      return {
        state: update.state,
        summary: update.summary ?? current.summary,
        message: update.message ?? null,
        contentLength: update.contentLength ?? null,
      }
    })
  }, [])

  const received = useCallback(
    (message: EntrySummaryMessage) => {
      apply({
        state: message.state,
        summary: message.summary,
        message: message.message,
        contentLength: message.content_length,
      })
    },
    [apply]
  )

  const connection = useCableSubscription<EntrySummaryMessage>(
    entryId === null ? null : { channel: "EntrySummaryChannel", entry_id: entryId },
    { received }
  )

  const request = useCallback(async () => {
    if (id === null || IN_FLIGHT.includes(stateRef.current)) return

    stateRef.current = "queued"
    // The stale paragraph stays on screen while its replacement is written; a
    // summary of slightly older text beats a blank space for a triage decision.
    setStatus((current) => ({ ...current, state: "queued", message: null, contentLength: null }))

    try {
      const response = await api.entries.summarize(id)
      apply({
        state: response.status,
        summary: response.summary,
        message: response.message,
        contentLength: response.content_length,
      })
    } catch (error) {
      apply({
        state: "failed",
        message: error instanceof Error ? error.message : REQUEST_FAILED,
      })
    }
  }, [id, apply])

  return { ...status, request, connection }
}
