import { Category } from "@/lib/api"

export interface CategoryWithPath {
  category: Category
  /** Titles from the root down to this category, its own title last. */
  path: string[]
  /** How many parents sit above this category; 0 for a root. */
  depth: number
}

/**
 * Every category with its ancestor path and depth, sorted by the joined path
 * so each category follows its parent and siblings read alphabetically. This
 * is the order the Move Feed and Edit Feed pickers list categories in, not the
 * sidebar's.
 *
 * Both walks stop on a category they have already passed. A parent cycle is
 * rejected server-side, but rows written before that guard can still hold one,
 * and without the visited set the path grows without bound and the picker
 * never opens. The path such a category gets is arbitrary in its starting
 * point, which is the honest rendering of data that has no root.
 */
export function buildCategoryPaths(categories: Category[]): CategoryWithPath[] {
  const categoryMap = new Map(categories.map((c) => [c.id, c]))

  const getPath = (cat: Category): string[] => {
    const path: string[] = []
    const seen = new Set<number>()
    let current: Category | undefined = cat
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      path.unshift(current.title)
      current = current.parent_id ? categoryMap.get(current.parent_id) : undefined
    }
    return path
  }

  const getDepth = (cat: Category): number => {
    let depth = 0
    const seen = new Set<number>([cat.id])
    let current: Category | undefined = cat
    while (current?.parent_id) {
      depth++
      const parent = categoryMap.get(current.parent_id)
      if (!parent || seen.has(parent.id)) break
      seen.add(parent.id)
      current = parent
    }
    return depth
  }

  const sortedCategories = [...categories].sort((a, b) => {
    const pathA = getPath(a).join("/")
    const pathB = getPath(b).join("/")
    return pathA.localeCompare(pathB)
  })

  return sortedCategories.map((cat) => ({
    category: cat,
    path: getPath(cat),
    depth: getDepth(cat),
  }))
}

/**
 * The entries with `search` anywhere in their path, ignoring case, so an
 * ancestor's name finds everything under it. A blank search keeps them all.
 */
export function filterCategoryPaths(
  items: CategoryWithPath[],
  search: string
): CategoryWithPath[] {
  if (!search.trim()) return items

  const searchLower = search.toLowerCase()
  return items.filter((item) =>
    item.path.some((title) => title.toLowerCase().includes(searchLower))
  )
}
