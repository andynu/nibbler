import { Category } from "@/lib/api"

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
 * The id of the category one step from `currentCategoryId` in sidebar order, or
 * null when there is nowhere to go.
 *
 * Null means the caller should show the reader that the move was refused; it
 * never means "did nothing on purpose". There are exactly two ways to get it:
 * the tree is empty, or the current category is already the last (`next`) or
 * first (`previous`) row. Nothing wraps. Wrapping would make Shift+J from the
 * bottom of the tree jump silently back to the top, which is indistinguishable
 * from having lost your place.
 *
 * With no category selected - a virtual folder, a tag, All Feeds - `next`
 * starts at the first category and `previous` at the last, so the first press
 * always lands somewhere.
 */
export function stepCategory(
  categories: Category[],
  currentCategoryId: number | null,
  direction: "next" | "previous"
): number | null {
  const ordered = categoriesInSidebarOrder(categories)
  if (ordered.length === 0) return null

  const currentIndex =
    currentCategoryId === null
      ? -1
      : ordered.findIndex((category) => category.id === currentCategoryId)

  // -1 covers both "nothing selected" and "the selected category is gone",
  // which want the same answer: start at whichever end the direction implies.
  if (currentIndex === -1) {
    return direction === "next" ? ordered[0].id : ordered[ordered.length - 1].id
  }

  const targetIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1
  if (targetIndex < 0 || targetIndex >= ordered.length) return null
  return ordered[targetIndex].id
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
