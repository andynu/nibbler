import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import type { SearchResult } from "@/lib/api"

/**
 * Long enough that a typist does not fire a request per keystroke, short enough
 * that the list feels like it is keeping up.
 */
export const SEARCH_DEBOUNCE_MS = 250

/**
 * The part of the current list scope the search endpoint actually honours.
 *
 * SearchController filters on feed_id and category_id only; unread, starred,
 * view, tag and the fresh params are accepted by api.search but silently
 * ignored (see the doc comment on api.search, and ttrb-aawe). Passing them
 * today would advertise a narrowing that does not happen, so this hook sends
 * only the two that work.
 */
export interface EntrySearchScope {
  feedId?: number | null
  categoryId?: number | null
}

export interface EntrySearch {
  query: string
  setQuery: (query: string) => void
  clear: () => void
  /** True once the box holds something other than whitespace. */
  isActive: boolean
  /** True from the first keystroke until the matching response settles. */
  isSearching: boolean
  results: SearchResult[]
  error: string | null
}

/**
 * Debounced server-side article search.
 *
 * Every effect run takes the next sequence number, which invalidates whatever
 * is already in flight. A response may only write state while its sequence is
 * still the current one, so a slow reply for an earlier query cannot land on
 * top of a newer one. Clearing the box takes a sequence number too, which is
 * how an in-flight request is abandoned without an AbortController.
 */
export function useEntrySearch(
  scope: EntrySearchScope = {},
  debounceMs: number = SEARCH_DEBOUNCE_MS
): EntrySearch {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestSeq = useRef(0)

  const trimmed = query.trim()
  const { feedId, categoryId } = scope

  useEffect(() => {
    const seq = ++requestSeq.current

    // An empty box is not a search: no request, straight back to the plain list.
    if (!trimmed) {
      setResults([])
      setIsSearching(false)
      setError(null)
      return
    }

    setIsSearching(true)
    const timer = setTimeout(() => {
      api
        .search({
          q: trimmed,
          feed_id: feedId || undefined,
          category_id: categoryId || undefined,
        })
        .then((response) => {
          if (seq !== requestSeq.current) return
          setResults(response.entries)
          setError(null)
          setIsSearching(false)
        })
        .catch((err: unknown) => {
          if (seq !== requestSeq.current) return
          setResults([])
          setError(err instanceof Error ? err.message : "Search failed")
          setIsSearching(false)
        })
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [trimmed, feedId, categoryId, debounceMs])

  const clear = useCallback(() => setQuery(""), [])

  return {
    query,
    setQuery,
    clear,
    isActive: trimmed.length > 0,
    isSearching,
    results,
    error,
  }
}
