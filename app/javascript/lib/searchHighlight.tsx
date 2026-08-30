import type { ReactNode } from "react"

/**
 * Single-character terms are dropped. They match somewhere in almost every
 * snippet, so marking them paints the row instead of pointing at anything.
 */
const MIN_TERM_LENGTH = 2

/** Letters, digits and underscore, unicode-aware (JS `\w` is ASCII only). */
const WORD_CHAR = "[\\p{L}\\p{N}_]"

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * The words of `query` that are worth marking: punctuation trimmed off each
 * end, blanks and single characters dropped, duplicates removed.
 *
 * Two tokens of the search syntax are dropped before any of that, because they
 * are instructions rather than words to look for. A `-term` is an exclusion, so
 * a row that came back is guaranteed not to contain it and marking it could
 * only be a false positive; a bare `or` is the alternation operator, and left
 * in it would mark every "order" and "Oregon" in a result title.
 */
export function searchTerms(query: string): string[] {
  const terms = query
    .split(/\s+/)
    .filter((term) => !term.startsWith("-") && term.toLowerCase() !== "or")
    .map((term) => term.replace(/^[^\p{L}\p{N}_]+|[^\p{L}\p{N}_]+$/gu, ""))
    .filter((term) => term.length >= MIN_TERM_LENGTH)

  return [...new Set(terms)]
}

/**
 * `text` split on the query's terms, with every match wrapped in a `<mark>`.
 *
 * This is the marking for an entry *title*, which the server sends as the plain
 * title: it is an identity field that other callers compare and assert on, so
 * it arrives unannotated and the marking happens here. Snippets take the other
 * route, `highlightHeadline` below.
 *
 * Nothing here is ever handed to `dangerouslySetInnerHTML`. The query is typed
 * by the user and the title is feed-supplied text; both stay text nodes that
 * React escapes on render, so a query of `<img onerror=...>` shows up as those
 * characters rather than as an element.
 *
 * Matching is looser than the search that produced the hit, on purpose.
 * Postgres puts the query through `websearch_to_tsquery`, which stems, so a
 * result can come back with no literal occurrence of what was typed. Anchoring
 * each term at a word start and extending the mark over the rest of the word
 * recovers the common English case: `run` marks `running`. The other direction
 * (`running` typed, `run` in the title) and irregular stems (`ran`, `mice`)
 * stay unmarked. A title is short and shown whole, so an unmarked stem there
 * costs the reader nothing but emphasis; in a snippet, where the excerpt is cut
 * around the match, it cost them the excerpt, which is why that side moved to
 * the server.
 */
export function highlightTerms(text: string, query: string): ReactNode {
  const terms = searchTerms(query)
  if (!text || terms.length === 0) return text

  const alternation = terms.map(escapeRegExp).join("|")
  const pattern = new RegExp(
    `((?<!${WORD_CHAR})(?:${alternation})${WORD_CHAR}*)`,
    "giu"
  )

  const parts = text.split(pattern)
  if (parts.length === 1) return text

  // String.split with one capture group alternates: plain, match, plain, ...
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="search-mark">
        {part}
      </mark>
    ) : (
      part
    )
  )
}

/**
 * The delimiters `ts_headline` wraps a matched lexeme in, U+0002 and U+0003.
 * They must match `Entry::HEADLINE_START` / `Entry::HEADLINE_STOP`.
 */
const HEADLINE_START = String.fromCharCode(2)
const HEADLINE_STOP = String.fromCharCode(3)

/**
 * A server-marked snippet, rendered with each delimited run in a `<mark>`.
 *
 * `SearchController` cuts the excerpt with `ts_headline`, so the marking is
 * stem-aware: a search for `studies` marks the `study` it actually matched,
 * which no amount of client-side substring work could find. What comes back is
 * still a plain string, not HTML. The delimiters are control characters, the
 * split below turns them into React elements, and every other character stays
 * a text node React escapes -- so a snippet containing `<script>` renders as
 * those characters, and `dangerouslySetInnerHTML` is not involved at any point.
 */
export function highlightHeadline(headline: string): ReactNode {
  if (!headline || !headline.includes(HEADLINE_START)) return headline

  const nodes: ReactNode[] = []

  headline.split(HEADLINE_START).forEach((chunk, index) => {
    if (index === 0) {
      if (chunk) nodes.push(chunk)
      return
    }

    const stop = chunk.indexOf(HEADLINE_STOP)
    if (stop === -1) {
      // An opening delimiter with no closing one is not something ts_headline
      // emits. Render the remainder as text rather than marking everything
      // from here to the end of the snippet.
      nodes.push(chunk)
      return
    }

    nodes.push(
      <mark key={index} className="search-mark">
        {chunk.slice(0, stop)}
      </mark>
    )
    const rest = chunk.slice(stop + HEADLINE_STOP.length)
    if (rest) nodes.push(rest)
  })

  return nodes
}
