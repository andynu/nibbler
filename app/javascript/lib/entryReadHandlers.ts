import { api, type Entry } from "@/lib/api"
import type { SearchResultPatch } from "@/hooks/useEntrySearch"

/**
 * Read state changes move badge counts and nothing structural, so the badges
 * come off loadCounters, whose response carries both unread maps. There is
 * deliberately no loadFeeds here: reloading the feed and category lists on
 * every opened article costs two requests that count unread per feed, and the
 * fresh arrays they return re-render the whole sidebar for numbers the
 * counters overlay already set.
 */
export interface EntryReadDeps {
  /** App's patchEntry: writes the fields to the list row and the open article. */
  patchEntry: (entryId: number, patch: Partial<Entry>) => void
  /** The search's own rows, which patchEntry does not reach. */
  updateSearchResult: (entryId: number, patch: SearchResultPatch) => void
  /** App's loadCounters: virtual folder totals plus feed and category badges. */
  loadCounters: () => unknown
}

/**
 * Flip one article's read state on the server and everywhere it is drawn.
 * Rethrows so the caller decides how a failure is reported.
 *
 * @returns the article's read state as the server now has it
 */
export async function toggleEntryRead(
  entryId: number,
  { patchEntry, updateSearchResult, loadCounters }: EntryReadDeps
): Promise<boolean> {
  const result = await api.entries.toggleRead(entryId)
  patchEntry(entryId, { unread: result.unread })
  updateSearchResult(entryId, { unread: result.unread })
  loadCounters()
  return result.unread
}

export interface MarkAllReadDeps {
  /** Clears the unread flag on whatever rows the reader has loaded. */
  markLoadedRead: () => void
  loadCounters: () => unknown
}

/** Mark everything in a feed, a category, or (no scope) everywhere as read. Rethrows. */
export async function markAllEntriesRead(
  scope: { feed_id?: number; category_id?: number },
  { markLoadedRead, loadCounters }: MarkAllReadDeps
): Promise<void> {
  await api.entries.markAllRead(scope)
  markLoadedRead()
  loadCounters()
}
