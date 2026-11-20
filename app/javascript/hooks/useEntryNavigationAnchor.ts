import { useCallback, useRef } from "react"

/** What j/k/n need of a row: where to go, whether it is unread, what to call it. */
export interface NavigableEntry {
  id: number
  unread: boolean
  title: string
}

/**
 * The list j/k/n walk: the one on screen. An active search replaces the entry
 * list with its hits, so the keys follow the hits, including an empty set
 * still in flight. Stepping through the hidden list instead opens, and marks
 * read, articles the reader cannot see.
 */
export function navigationList(
  entries: ReadonlyArray<NavigableEntry>,
  search: { isActive: boolean; results: ReadonlyArray<NavigableEntry> }
): ReadonlyArray<NavigableEntry> {
  return search.isActive ? search.results : entries
}

export interface EntryNavigationAnchor {
  /** A load for this entry has been issued. */
  begin: (entryId: number) => void
  /** The load issued last has finished, and whether its entry reached the pane. */
  settle: (opened: boolean) => void
  /** Selection was cleared by something other than a load. */
  drop: () => void
  /** The list row the next j/k press moves from, or -1 for none. */
  navigationIndex: () => number
}

/**
 * The entry the reader is heading for, set the moment a request is issued
 * rather than when it returns. Navigation anchors on this ahead of the
 * rendered selection, so a press landing mid-fetch steps on from the pending
 * target instead of repeating the move already under way.
 *
 * `entries` and `selectedEntryId` are the render's, and the keyboard listener
 * only sees a render once React commits it, which can be a task after the
 * reply set the selection.
 */
export function useEntryNavigationAnchor(
  entries: ReadonlyArray<{ id: number }>,
  selectedEntryId: number | null
): EntryNavigationAnchor {
  const pendingEntryIdRef = useRef<number | null>(null)

  const begin = useCallback((entryId: number) => {
    pendingEntryIdRef.current = entryId
  }, [])

  // An opened entry stays the anchor: it is the selection the next commit will
  // show, and clearing it here would hand a press in the gap the previous
  // commit's selection. Only a load that changed nothing gives the anchor back.
  const settle = useCallback((opened: boolean) => {
    if (!opened) pendingEntryIdRef.current = null
  }, [])

  const drop = useCallback(() => {
    pendingEntryIdRef.current = null
  }, [])

  const currentIndex =
    selectedEntryId === null ? -1 : entries.findIndex((e) => e.id === selectedEntryId)

  // Read at press time rather than off the render, so a burst advances once
  // per press. A pending entry outside the list (opened from search, say)
  // leaves the anchor on the selection.
  const navigationIndex = useCallback(() => {
    const pendingId = pendingEntryIdRef.current
    if (pendingId === null) return currentIndex
    const pendingIndex = entries.findIndex((e) => e.id === pendingId)
    return pendingIndex === -1 ? currentIndex : pendingIndex
  }, [entries, currentIndex])

  return { begin, settle, drop, navigationIndex }
}
