/**
 * Anything the sidebar draws an unread badge on: feeds and categories both.
 */
interface UnreadCounted {
  id: number
  unread_count: number
}

/**
 * Overlay the unread map from GET /api/v1/counters onto the feed or category
 * objects already in hand.
 *
 * The counters endpoint returns `{ feeds: {id => unread}, categories: {id =>
 * unread} }` alongside the virtual-folder totals, which is everything the
 * badges need. Refetching the whole feed and category lists to get the same
 * numbers costs two more requests per background tick and replaces every
 * object in the process (ttrb-81wy).
 *
 * Two things this has to get right, both of which the naive spread gets wrong:
 *
 * - The map is a `GROUP BY ... COUNT`, so a feed with nothing unread is absent
 *   from it rather than present with a zero. An absent id means zero; leaving
 *   the old count in place would strand a badge on a feed the reader just
 *   finished.
 * - Identity is the render signal. An item whose count did not move is
 *   returned as-is, and an array where nothing moved is returned as the same
 *   array, so React bails out of the re-render entirely. That is what keeps a
 *   poll from resetting the sidebar's scroll position or its drag state.
 *
 * Only `unread_count` is touched. Structural fields (title, category, order)
 * come from the feeds and categories endpoints, which is why those still have
 * to be reloaded occasionally.
 *
 * @param items feeds or categories as currently held in state
 * @param counts the `feeds` or `categories` map from the counters response
 * @returns `items` unchanged when no count moved, otherwise a new array
 */
export function applyUnreadCounts<T extends UnreadCounted>(
  items: T[],
  counts: Record<number, number> | undefined
): T[] {
  if (!counts) return items

  let changed = false
  const next = items.map((item) => {
    const unread_count = counts[item.id] ?? 0
    if (unread_count === item.unread_count) return item
    changed = true
    return { ...item, unread_count }
  })

  return changed ? next : items
}
