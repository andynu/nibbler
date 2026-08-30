import { Category, Feed } from "@/lib/api"

/**
 * The ids of the categories the sidebar draws a row for.
 *
 * This is the one definition of "visible", and it has exactly two consumers:
 * FeedSidebar, which returns null instead of a row for anything outside the
 * set, and useCategoryNavigation, which will not step onto one. It used to be
 * neither - it was a `return null` buried in FeedSidebar's render, which is a
 * fact no other file could ask about, so Shift+J walked straight through rows
 * that were never painted (ttrb-ziba).
 *
 * Hiding and folding are different gestures and only one of them is in here:
 *
 *  - Hide-read is a filter. The reader has said these rows should not exist,
 *    so navigation must not visit them.
 *  - Collapsing a folder is a fold, not a filter. Expansion state lives in
 *    FeedSidebar and is persisted per browser, so honouring it here would make
 *    a category unreachable from the keyboard because of a folder someone
 *    closed once on another machine. Collapsed folders stay navigable and the
 *    sidebar opens the ancestors of whatever gets selected (ttrb-s4mr).
 *
 * With hide-read off every category is visible. With it on, a category earns
 * its row by having an unread feed of its own or an unread feed anywhere below
 * it, at any depth. Depth matters: a folder whose only unread feed sits two
 * levels down still has to be drawn, or the row holding that feed has no
 * parent to hang off.
 *
 * `hide_read_shows_special` is not consulted, because nothing consults it. As
 * of this commit the key exists only in the API type, the defaults map, the
 * controller's permit list and the fixtures; no component reads it, and it has
 * never taken part in this calculation (ttrb-nr6q).
 */
export function visibleCategoryIds(
  categories: Category[],
  feeds: Feed[],
  hideReadFeeds: boolean
): Set<number> {
  if (!hideReadFeeds) return new Set(categories.map((category) => category.id))

  const hasOwnUnread = new Set<number>()
  for (const feed of feeds) {
    if (feed.unread_count > 0 && feed.category_id !== null) {
      hasOwnUnread.add(feed.category_id)
    }
  }

  const childrenByParent = new Map<number, Category[]>()
  for (const category of categories) {
    const parentId = category.parent_id
    if (parentId === null) continue
    const siblings = childrenByParent.get(parentId)
    if (siblings) {
      siblings.push(category)
    } else {
      childrenByParent.set(parentId, [category])
    }
  }

  const visible = new Set<number>()
  // Doubles as the memo and the cycle guard. Once an id is in here its answer
  // is `visible.has(id)`; while it is still on the stack that reads false,
  // which is what makes a parent cycle terminate instead of recursing forever.
  const settled = new Set<number>()

  const walk = (category: Category): boolean => {
    if (settled.has(category.id)) return visible.has(category.id)
    settled.add(category.id)

    let showRow = hasOwnUnread.has(category.id)
    // Every child is walked even once the answer is known: their own rows are
    // being decided in the same pass, and stopping early would leave them
    // unsettled.
    for (const child of childrenByParent.get(category.id) ?? []) {
      if (walk(child)) showRow = true
    }

    if (showRow) visible.add(category.id)
    return showRow
  }

  for (const category of categories) walk(category)
  return visible
}

/**
 * The category tree flattened into the order FeedSidebar paints it.
 *
 * Two rules, both read off the sidebar rather than invented here:
 *
 *  - Root categories keep the order the server sent (`Category.ordered` is
 *    `order(:order_id, :title)`), because FeedSidebar renders
 *    `categories.filter((c) => !c.parent_id)` without re-sorting.
 *  - Children are sorted by title, because CategoryItem sorts them that way
 *    before rendering.
 *
 * Every category is walked, expanded or collapsed. Expansion state lives in
 * FeedSidebar's own `expandedCategories` set and is persisted per browser;
 * keyboard navigation that skipped collapsed folders would make a category
 * unreachable from the keyboard because of a folder someone closed once.
 *
 * A category whose `parent_id` names a category outside `categories` is left
 * out, matching the sidebar: it renders neither as a root nor under a parent,
 * so there is no row to navigate to. The `visited` set makes a parent cycle
 * terminate rather than recurse forever.
 */
export function categoriesInSidebarOrder(categories: Category[]): Category[] {
  const childrenByParent = new Map<number | null, Category[]>()
  for (const category of categories) {
    const parentId = category.parent_id ?? null
    const siblings = childrenByParent.get(parentId)
    if (siblings) {
      siblings.push(category)
    } else {
      childrenByParent.set(parentId, [category])
    }
  }

  const ordered: Category[] = []
  const visited = new Set<number>()

  const walk = (nodes: Category[], sortByTitle: boolean) => {
    const inOrder = sortByTitle
      ? [...nodes].sort((a, b) => a.title.localeCompare(b.title))
      : nodes
    for (const node of inOrder) {
      if (visited.has(node.id)) continue
      visited.add(node.id)
      ordered.push(node)
      walk(childrenByParent.get(node.id) ?? [], true)
    }
  }

  walk(childrenByParent.get(null) ?? [], false)
  return ordered
}

/**
 * The id of the next category the reader can actually see, one step from
 * `currentCategoryId` in sidebar order, or null when there is nowhere to go.
 *
 * Null means the caller should show the reader that the move was refused; it
 * never means "did nothing on purpose". There are exactly two ways to get it:
 * nothing is visible at all, or every row past the current one in that
 * direction is hidden. Nothing wraps. Wrapping would make Shift+J from the
 * bottom of the tree jump silently back to the top, which is indistinguishable
 * from having lost your place.
 *
 * With no category selected - a virtual folder, a tag, All Feeds - `next`
 * starts at the first visible category and `previous` at the last, so the first
 * press always lands somewhere.
 *
 * `visibleIds` is what `visibleCategoryIds` returned; omit it and every
 * category counts as visible.
 *
 * The scan is over the full order, with hidden rows skipped, rather than over a
 * pre-filtered list. That is what decides the awkward case: the reader is
 * parked on a category, marks its last unread article read, and the row it was
 * measuring from disappears from under them. Scanning the full order keeps the
 * cursor in its old slot, so the next press lands on the nearest visible
 * neighbour in the direction pressed. Filtering first would drop the current id
 * out of the list entirely, and the "nothing is selected" branch below would
 * fire instead, teleporting the reader to the top or the bottom of the tree
 * after a keystroke that asked for one step.
 */
export function stepCategory(
  categories: Category[],
  currentCategoryId: number | null,
  direction: "next" | "previous",
  visibleIds?: Set<number>
): number | null {
  const ordered = categoriesInSidebarOrder(categories)
  if (ordered.length === 0) return null

  const currentIndex =
    currentCategoryId === null
      ? -1
      : ordered.findIndex((category) => category.id === currentCategoryId)

  const stepBy = direction === "next" ? 1 : -1
  // -1 covers "nothing selected" and "the selected category is gone from the
  // tree", which want the same answer: start off the end the direction comes
  // from, so the first row examined is the first or the last.
  const from = currentIndex === -1 ? (direction === "next" ? -1 : ordered.length) : currentIndex

  for (let i = from + stepBy; i >= 0 && i < ordered.length; i += stepBy) {
    const candidate = ordered[i]
    if (!visibleIds || visibleIds.has(candidate.id)) return candidate.id
  }
  return null
}

/**
 * `categoryId` and every category above it, nearest parent first.
 *
 * Callers use this to open the folders a category is buried under before trying
 * to scroll its row into view. Returns an empty array for an unknown id, and
 * stops on a repeat so a parent cycle cannot hang the caller.
 */
export function categoryAncestorIds(
  categories: Category[],
  categoryId: number | null
): number[] {
  if (categoryId === null) return []

  const byId = new Map(categories.map((category) => [category.id, category]))
  const chain: number[] = []
  const seen = new Set<number>()
  let cursor: number | null = categoryId

  while (cursor !== null && !seen.has(cursor)) {
    const category = byId.get(cursor)
    if (!category) break
    seen.add(cursor)
    chain.push(cursor)
    cursor = category.parent_id ?? null
  }

  return chain
}
