import { Sparkles, Loader2, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { EntrySummary, EntrySummaryState } from "@/lib/api"
import type { CableSubscriptionState } from "@/hooks/useCableSubscription"

interface EntrySummaryCalloutProps {
  /** Whether the segment is on screen. The live region is mounted either way. */
  visible: boolean
  /** Where generation is, straight off useEntrySummary. */
  state: EntrySummaryState
  /** The paragraph, once there is one. A stale one is still here. */
  summary: EntrySummary | null
  /** The server's reason for a terminal non-ready state. */
  message: string | null
  /** Length of the article's text, sent with "too_short". */
  contentLength: number | null
  /** The channel's own state, so a refused subscription is not a silent wait. */
  connection: CableSubscriptionState
  /** Ask for a fresh paragraph: retry after a failure, or replace a stale one. */
  onRegenerate: () => void
  /** Put the segment away. The header button brings it back. */
  onDismiss: () => void
}

/** States where the model has the article and the reader is waiting. */
const IN_FLIGHT: EntrySummaryState[] = ["queued", "running"]

/**
 * What the live region says, which is deliberately terser than what the segment
 * shows. A screen reader gets the state change as one short sentence and can
 * then read the segment itself at its own pace; announcing the whole paragraph
 * would talk over a reader who only wanted to know the wait had ended.
 */
const ANNOUNCEMENTS: Record<EntrySummaryState, string> = {
  idle: "",
  queued: "Summary queued.",
  running: "Writing the summary.",
  ready: "Summary ready.",
  failed: "The summary failed.",
  unavailable: "The summarizer is not available.",
  too_short: "This article is too short to summarize.",
}

/**
 * Used only when a terminal state arrives with no message, which the server
 * does not currently do. Deliberately not treated as the source of the wording:
 * SummarizeEntryJob owns these strings and sends them, and if the two ever
 * disagree the server's is what the reader sees.
 */
const FALLBACK_MESSAGES: Partial<Record<EntrySummaryState, string>> = {
  failed: "The summary could not be generated.",
  unavailable: "The summarizer is not responding right now.",
  too_short: "This article is too short to summarize.",
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * The machine-written paragraph, and everything that happens on the way to it.
 *
 * Sits between the article header and the article body, and is styled to be
 * read as an annotation on the piece rather than part of it: a tinted panel
 * with an accent edge, its provenance line naming the model underneath. Every
 * colour comes from a theme token, so it holds on the palettes that exist and
 * on the ones the theming work adds.
 *
 * == Why the live region is mounted even when nothing is showing
 *
 * A live region has to be in the document *before* its content changes for a
 * screen reader to announce that change; one that appears already populated is
 * usually read as ordinary page content, if at all. So the region is rendered
 * unconditionally, empty, and fills in when there is something to say. That is
 * also why this component owns its own visibility rather than the caller
 * skipping it: unmounting the callout would take the region with it.
 *
 * == Progress is not one spinner
 *
 * Generation on a local model takes tens of seconds, and the job broadcasts
 * "queued" and "running" as distinct states because the two waits mean
 * different things -- the server has the request versus the model is writing.
 * Collapsing them into one indeterminate spinner would throw away something the
 * server already knows and the reader can use.
 *
 * @see useEntrySummary for the channel and the request
 */
export function EntrySummaryCallout({
  visible,
  state,
  summary,
  message,
  contentLength,
  connection,
  onRegenerate,
  onDismiss,
}: EntrySummaryCalloutProps) {
  const inFlight = IN_FLIGHT.includes(state)
  const failed = state === "failed" || state === "unavailable"
  const stale = state === "ready" && !!summary?.stale
  const detail = message ?? FALLBACK_MESSAGES[state] ?? null

  // A rejected subscription is the server refusing this entry, not a socket
  // that will come back, and Action Cable does not retry it. Without saying so
  // the reader watches a spinner that has nothing left to resolve it.
  const orphaned = inFlight && connection === "rejected"

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {visible ? ANNOUNCEMENTS[state] : ""}
      </p>
      {visible && (
        <div
          data-testid="entry-summary-callout"
          className={cn(
            "mb-4 sm:mb-6 rounded-md border border-border border-l-2 border-l-accent-primary",
            // Full-strength muted rather than a tint: the surface is then
            // exactly the one --color-muted-foreground, --color-warning and
            // --color-destructive-text are measured against in every palette
            // (e2e/settings.spec.ts), so the panel's text inherits those
            // guarantees instead of landing on a composite nothing measures.
            "bg-muted px-3 py-2.5 sm:px-4 sm:py-3"
          )}
        >
          <div className="flex items-center gap-2">
            {inFlight ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Summary
            </span>
            <div className="ml-auto flex items-center gap-1">
              {(failed || stale) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={onRegenerate}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {failed ? "Try again" : "Regenerate"}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onDismiss}
                aria-label="Dismiss summary"
                title="Dismiss summary"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {inFlight && (
            <p className="mt-2 text-sm text-muted-foreground">
              {state === "queued"
                ? "Queued. The summarizer has the request and has not started on it yet."
                : "Writing the summary. A local model takes a few tens of seconds."}
            </p>
          )}

          {orphaned && (
            <p className="mt-2 text-sm text-warning">
              This article's updates were refused, so the paragraph will not arrive here on its
              own. Reopen the article to check.
            </p>
          )}

          {failed && detail && <p className="mt-2 text-sm text-destructive-text">{detail}</p>}

          {state === "too_short" && (
            <p className="mt-2 text-sm text-muted-foreground">
              {detail}
              {contentLength !== null && ` The feed published ${contentLength.toLocaleString()} characters of text.`}
            </p>
          )}

          {stale && (
            <p className="mt-2 text-sm text-warning">
              This describes an earlier version of the article.
            </p>
          )}

          {summary && (
            <>
              <p data-testid="entry-summary-text" className="mt-2 text-sm leading-relaxed">
                {summary.summary}
              </p>
              <p data-testid="entry-summary-provenance" className="mt-2 text-xs text-muted-foreground">
                Machine-generated by {summary.model} ·{" "}
                <time dateTime={summary.generated_at}>
                  {formatGeneratedAt(summary.generated_at)}
                </time>
              </p>
            </>
          )}
        </div>
      )}
    </>
  )
}
