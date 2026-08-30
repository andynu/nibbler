import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import type { EntryView, FreshMaxAge, SearchParams, SearchResult } from "@/lib/api"

/**
 * Long enough that a typist does not fire a request per keystroke, short enough
 * that the list feels like it is keeping up.
 */
export const SEARCH_DEBOUNCE_MS = 250

/**
 * The scope of the list the search is being run from, in the param names both
 * api.entries.list and /api/v1/search read. Deliberately snake_case and
 * byte-identical to `SearchParams`, so application.tsx hands its `entriesQuery`
 * straight over with no translation layer to drift (ttrb-aawe).
 *
 * `sort` and `order_by` are absent on purpose: search results come back ranked
 * by relevance and the sort controls cannot reorder them.
 */
export interface EntryListScope {
  unread?: boolean
  starred?: boolean
  feed_id?: number
  category_id?: number
  view?: EntryView
  tag?: string
  fresh_max_age?: FreshMaxAge
  fresh_per_feed?: number
}

/** Which feeds the search covers: the list the reader is in, or all of them. */
export type SearchPlace = "list" | "everything"

/** How far back the search reaches: the list's own read-state window, or all of it. */
export type SearchHistory = "list" | "all"

export interface SearchScope {
  place: SearchPlace
  history: SearchHistory
}

/**
 * Search inherits the list. Someone who hits `/` inside a feed is asking about
 * that feed, and a result set that quietly disagreed with the list beside it
 * would be the harder thing to explain. Both narrowings are named on screen and
 * each is one keystroke from being dropped, so the default costs nothing when
 * it is wrong.
 */
export const DEFAULT_SEARCH_SCOPE: SearchScope = { place: "list", history: "list" }

/**
 * Views that say WHERE an article is filed. They widen with the feed and the
 * category, because that is the same question: which articles am I looking at.
 */
const PLACE_VIEWS: readonly EntryView[] = [ "starred", "published" ]

/**
 * Views that say WHEN, by way of read state. Fresh is `unread` plus an age
 * cutoff plus a per-feed cap; Archived is `read`. Neither can survive the
 * history control being widened -- keeping `view: "fresh"` while claiming to
 * search read articles would send `unread` right back through the server's
 * own definition of the view -- so these belong to the history axis and are
 * dropped by it alone.
 *
 * Splitting the views this way keeps every param owned by exactly one control.
 * The alternative, letting "everything" drop the view as well, makes the two
 * controls do the same thing in Fresh and leaves the pills describing a filter
 * the other pill had already removed.
 */
const HISTORY_VIEWS: readonly EntryView[] = [ "fresh", "archived" ]

/** Whether the list narrows by place at all, i.e. whether widening has anything to do. */
export function narrowsByPlace(scope: EntryListScope): boolean {
  return Boolean(
    scope.feed_id ||
      scope.category_id ||
      scope.tag ||
      scope.starred === true ||
      (scope.view && PLACE_VIEWS.includes(scope.view))
  )
}

/** Whether the list imposes a read-state window that deeper history would lift. */
export function narrowsByHistory(scope: EntryListScope): boolean {
  return Boolean(
    scope.unread !== undefined || (scope.view && HISTORY_VIEWS.includes(scope.view))
  )
}

/**
 * The exact params a search sends, given the list it came from and the scope
 * the reader has chosen. Pure and exported so the wiring can be asserted
 * directly: a test that only checks a control renders would still pass with
 * every line below deleted.
 *
 * The Fresh case is the one worth staring at. `view: "fresh"` on its own means
 * the server's default max age and no per-feed cap, so a search from a Fresh
 * list showing "month / 5 per feed" that sent only the view would silently
 * range wider than the list it is standing in. All three travel together or
 * none of them do.
 */
export function buildSearchParams(
  query: string,
  list: EntryListScope,
  scope: SearchScope
): SearchParams {
  const params: SearchParams = { q: query }

  if (scope.place === "list") {
    if (list.feed_id) params.feed_id = list.feed_id
    if (list.category_id) params.category_id = list.category_id
    if (list.tag) params.tag = list.tag
    if (list.starred === true) params.starred = true
    if (list.view && PLACE_VIEWS.includes(list.view)) params.view = list.view
  }

  if (scope.history === "list") {
    if (list.unread !== undefined) params.unread = list.unread
    if (list.view && HISTORY_VIEWS.includes(list.view)) {
      params.view = list.view
      if (list.view === "fresh") {
        if (list.fresh_max_age) params.fresh_max_age = list.fresh_max_age
        if (list.fresh_per_feed) params.fresh_per_feed = list.fresh_per_feed
      }
    }
  }

  return params
}

export interface EntrySearch {
  query: string
  setQuery: (query: string) => void
  /** Empties the box and puts the scope back to the list's own. */
  clear: () => void
  /** True once the box holds something other than whitespace. */
  isActive: boolean
  /** True from the first keystroke until the matching response settles. */
  isSearching: boolean
  results: SearchResult[]
  error: string | null
  place: SearchPlace
  setPlace: (place: SearchPlace) => void
  history: SearchHistory
  setHistory: (history: SearchHistory) => void
  /** The list narrows by feed, category, tag or a place view, so widening means something. */
  canWidenPlace: boolean
  /** The list imposes a read-state window, so deeper history means something. */
  canWidenHistory: boolean
  /**
   * Matches the same query has with every filter dropped, or null when that is
   * not worth saying. Only fetched when a narrowed search came back empty,
   * which is exactly when the reader needs to know widening would help.
   */
  widerMatchCount: number | null
}

/**
 * Debounced server-side article search, scoped to the list it was launched
 * from and widenable from there.
 *
 * Every effect run takes the next sequence number, which invalidates whatever
 * is already in flight. A response may only write state while its sequence is
 * still the current one, so a slow reply for an earlier query cannot land on
 * top of a newer one. Clearing the box takes a sequence number too, which is
 * how an in-flight request is abandoned without an AbortController.
 */
export function useEntrySearch(
  list: EntryListScope = {},
  debounceMs: number = SEARCH_DEBOUNCE_MS
): EntrySearch {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [place, setPlace] = useState<SearchPlace>(DEFAULT_SEARCH_SCOPE.place)
  const [history, setHistory] = useState<SearchHistory>(DEFAULT_SEARCH_SCOPE.history)
  const [widerMatchCount, setWiderMatchCount] = useState<number | null>(null)

  const requestSeq = useRef(0)

  const trimmed = query.trim()
  // Destructured to primitives so the effect below depends on the scope's
  // values rather than the caller's object identity: `entriesQuery` is rebuilt
  // whenever the sort or the page size moves, neither of which changes what a
  // search should return.
  const {
    unread,
    starred,
    feed_id: feedId,
    category_id: categoryId,
    view,
    tag,
    fresh_max_age: freshMaxAge,
    fresh_per_feed: freshPerFeed,
  } = list

  useEffect(() => {
    const seq = ++requestSeq.current

    // An empty box is not a search: no request, straight back to the plain list.
    if (!trimmed) {
      setResults([])
      setIsSearching(false)
      setError(null)
      setWiderMatchCount(null)
      return
    }

    const listScope: EntryListScope = {
      unread,
      starred,
      feed_id: feedId,
      category_id: categoryId,
      view,
      tag,
      fresh_max_age: freshMaxAge,
      fresh_per_feed: freshPerFeed,
    }
    const params = buildSearchParams(trimmed, listScope, { place, history })
    // Anything beyond `q` is a filter the reader could drop, and therefore a
    // reason to count what dropping it would find.
    const isNarrowed = Object.keys(params).length > 1

    setIsSearching(true)
    const timer = setTimeout(() => {
      api
        .search(params)
        .then((response) => {
          if (seq !== requestSeq.current) return
          setResults(response.entries)
          setError(null)
          setIsSearching(false)
          setWiderMatchCount(null)

          if (response.entries.length > 0 || !isNarrowed) return
          // Nothing here, and there is a scope to blame for it. One extra
          // request buys "42 matches in all articles" instead of a dead end
          // the reader has to guess their way out of. per_page 1 because only
          // the total is wanted; the server counts before it paginates.
          api
            .search({ q: trimmed, per_page: 1 })
            .then((wider) => {
              if (seq !== requestSeq.current) return
              setWiderMatchCount(wider.pagination.total)
            })
            .catch(() => {
              // The nudge is a courtesy. Losing it must not turn a search that
              // merely found nothing into a search that failed.
            })
        })
        .catch((err: unknown) => {
          if (seq !== requestSeq.current) return
          setResults([])
          setWiderMatchCount(null)
          setError(err instanceof Error ? err.message : "Search failed")
          setIsSearching(false)
        })
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [
    trimmed,
    place,
    history,
    unread,
    starred,
    feedId,
    categoryId,
    view,
    tag,
    freshMaxAge,
    freshPerFeed,
    debounceMs,
  ])

  // Escape and the clear button both land here, which is what makes the scope
  // reset on Escape rather than on any keystroke that happens to empty the box.
  const clear = useCallback(() => {
    setQuery("")
    setPlace(DEFAULT_SEARCH_SCOPE.place)
    setHistory(DEFAULT_SEARCH_SCOPE.history)
  }, [])

  const scopeForFlags: EntryListScope = {
    unread,
    starred,
    feed_id: feedId,
    category_id: categoryId,
    view,
    tag,
  }

  return {
    query,
    setQuery,
    clear,
    isActive: trimmed.length > 0,
    isSearching,
    results,
    error,
    place,
    setPlace,
    history,
    setHistory,
    canWidenPlace: narrowsByPlace(scopeForFlags),
    canWidenHistory: narrowsByHistory(scopeForFlags),
    widerMatchCount,
  }
}
