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
 */
export function searchTerms(query: string): string[] {
  const terms = query
    .split(/\s+/)
    .map((term) => term.replace(/^[^\p{L}\p{N}_]+|[^\p{L}\p{N}_]+$/gu, ""))
    .filter((term) => term.length >= MIN_TERM_LENGTH)

  return [...new Set(terms)]
}

/**
 * `text` split on the query's terms, with every match wrapped in a `<mark>`.
 *
 * Nothing here is ever handed to `dangerouslySetInnerHTML`. The query is typed
 * by the user and the snippet is server-supplied article text; both stay text
 * nodes that React escapes on render, so a query of `<img onerror=...>` shows
 * up as those characters rather than as an element.
 *
 * Matching is looser than the search that produced the hit, on purpose.
 * Postgres puts the query through `plainto_tsquery`, which stems, so a result
 * can come back with no literal occurrence of what was typed. Anchoring each
 * term at a word start and extending the mark over the rest of the word
 * recovers the common English case: `run` marks `running`. The other direction
 * (`running` typed, `run` in the text) and irregular stems (`ran`, `mice`) stay
 * unmarked, and `generate_snippet` in SearchController picks its excerpt with
 * the same plain substring match, so a purely stemmed hit can return a snippet
 * with nothing to mark at all. Fixing that properly means `ts_headline` on the
 * server, which marks stem-aware and would replace `generate_snippet`
 * outright; filed as ttrb-clec.
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
