import { useMemo } from "react"
import { Category } from "@/lib/api"
import {
  buildCategoryPaths,
  filterCategoryPaths,
  CategoryWithPath,
} from "@/lib/categoryPaths"

export interface CategoryPaths {
  /** Every category in path order, whatever the search. */
  categoriesWithPaths: CategoryWithPath[]
  /** The same list narrowed to the search. */
  filteredCategories: CategoryWithPath[]
}

/**
 * The searchable category list shared by the Move Feed dialog and the Edit
 * Feed category selector. The caller owns `search`, since each picker clears
 * it on its own close.
 */
export function useCategoryPaths(categories: Category[], search: string): CategoryPaths {
  const categoriesWithPaths = useMemo(() => buildCategoryPaths(categories), [categories])

  const filteredCategories = useMemo(
    () => filterCategoryPaths(categoriesWithPaths, search),
    [categoriesWithPaths, search]
  )

  return { categoriesWithPaths, filteredCategories }
}
