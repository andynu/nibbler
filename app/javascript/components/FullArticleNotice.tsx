import { Download, ExternalLink, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { FullArticleState } from "@/hooks/useFullArticle"

interface FullArticleNoticeProps {
  /** Where the fetch has got to, straight off useFullArticle. */
  state: FullArticleState
  /** The server's one sentence for a fetch that did not work. */
  message: string | null
  /** The article on the publisher's own site, which is always offered. */
  link: string
  /** Go and get the publisher's copy. */
  onFetch: () => void
}

/**
 * What a reader is told and offered about an article whose feed sent an excerpt.
 *
 * Sits under the body, which is where a reader arrives at the end of two
 * sentences wanting the rest. Four states and no more:
 *
 * - idle: the feed published an excerpt and nobody has asked for the rest yet.
 * - fetching: the request is out. It is one HTTP call rather than a local model,
 *   so this is seconds and a single spinner is the honest amount of detail.
 * - ready: the body above is the publisher's copy, said plainly so the reader
 *   knows they are no longer looking at what the feed sent.
 * - unavailable: it did not work. One sentence, no cause, and the link.
 *
 * == Why the failure never says why
 *
 * A paywall, a bot filter's 403, a timeout and a page with no prose in it are
 * not distinguishable from the server's side: most walls answer 200 with a
 * truncated body, so telling one from another would be a guess, and a timeout
 * labelled a paywall is worse than a sentence that claims nothing. The reader
 * gets the fact and the link, which is the part they can act on.
 *
 * @see useFullArticle for the request
 * @see EntryFullText for the row and the retry window behind it
 */
export function FullArticleNotice({ state, message, link, onFetch }: FullArticleNoticeProps) {
  return (
    <div className="mt-6" data-testid="full-article-notice">
      {/* Terser than what the panel shows, deliberately: a screen reader gets
          the state change as one short phrase and can then read the panel at
          its own pace. Worded so it does not repeat the visible sentence
          verbatim, which would be announced and then read again. */}
      <p role="status" aria-live="polite" className="sr-only">
        {state === "fetching" ? "Fetching the full article." : ""}
        {state === "ready" ? "The full article is shown." : ""}
        {state === "unavailable" ? "The full article was not retrieved." : ""}
      </p>

      {state === "ready" ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          This is the publisher's copy of the article. The feed published an excerpt.
        </p>
      ) : (
        <div className="rounded-md border border-dashed p-4">
          {state === "unavailable" ? (
            <p className="text-sm text-muted-foreground">{message}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              This feed publishes an excerpt. The rest of the article is on the publisher's site.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {state !== "unavailable" && (
              <Button variant="outline" size="sm" onClick={onFetch} disabled={state === "fetching"}>
                {state === "fetching" ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="h-4 w-4 mr-1" aria-hidden="true" />
                )}
                {state === "fetching" ? "Fetching the full article" : "Get the full article"}
              </Button>
            )}
            {/* Deliberately not "Open the original site", which the empty-body
                block a few lines up already uses: two controls with the same
                accessible name on one article is a maze for a screen reader and
                an ambiguous getByRole for a test. */}
            <Button variant="outline" size="sm" asChild>
              <a href={link} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" aria-hidden="true" />
                Read it on the publisher's site
              </a>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
