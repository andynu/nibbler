import { describe, it, expect } from "vitest"
import { Category } from "@/lib/api"
import {
  categoriesInSidebarOrder,
  categoryAncestorIds,
  stepCategory,
} from "./categoryNavigation"

function category(
  id: number,
  title: string,
  parentId: number | null = null,
  orderId = 0
): Category {
  return {
    id,
    title,
    parent_id: parentId,
    collapsed: false,
    order_id: orderId,
    feed_count: 0,
    unread_count: 0,
  }
}

/**
 * The shape E2eDataset seeds, and the one the E2E spec walks:
 * Technology > Programming, then Science.
 */
function seededTree(): Category[] {
  return [
    category(1, "Technology", null, 0),
    category(2, "Programming", 1, 1),
    category(3, "Science", null, 2),
  ]
}

describe("categoriesInSidebarOrder", () => {
  it("returns nothing for an empty tree", () => {
    expect(categoriesInSidebarOrder([])).toEqual([])
  })

  it("puts each child directly after its parent", () => {
    const ordered = categoriesInSidebarOrder(seededTree())

    expect(ordered.map((c) => c.title)).toEqual(["Technology", "Programming", "Science"])
  })

  it("keeps roots in the order the server sent rather than sorting them", () => {
    // The sidebar renders `categories.filter((c) => !c.parent_id)` untouched, so
    // order_id wins over the alphabet at the root.
    const ordered = categoriesInSidebarOrder([
      category(1, "Zebras", null, 0),
      category(2, "Aardvarks", null, 1),
    ])

    expect(ordered.map((c) => c.title)).toEqual(["Zebras", "Aardvarks"])
  })

  it("sorts children by title, which is how CategoryItem renders them", () => {
    const ordered = categoriesInSidebarOrder([
      category(1, "Technology", null, 0),
      category(2, "Zebras", 1, 0),
      category(3, "Aardvarks", 1, 1),
    ])

    expect(ordered.map((c) => c.title)).toEqual(["Technology", "Aardvarks", "Zebras"])
  })

  it("descends into grandchildren before moving to the next sibling", () => {
    const ordered = categoriesInSidebarOrder([
      category(1, "Technology", null, 0),
      category(2, "Programming", 1, 0),
      category(3, "Rust", 2, 0),
      category(4, "Hardware", 1, 1),
      category(5, "Science", null, 1),
    ])

    expect(ordered.map((c) => c.title)).toEqual([
      "Technology",
      "Hardware",
      "Programming",
      "Rust",
      "Science",
    ])
  })

  it("leaves out a category whose parent is not in the list, matching the sidebar", () => {
    const ordered = categoriesInSidebarOrder([
      category(1, "Technology", null, 0),
      category(9, "Orphan", 404, 0),
    ])

    expect(ordered.map((c) => c.title)).toEqual(["Technology"])
  })

  it("terminates on a parent cycle instead of recursing forever", () => {
    const ordered = categoriesInSidebarOrder([
      category(1, "Loop A", 2, 0),
      category(2, "Loop B", 1, 1),
    ])

    // Neither is a root, so neither is rendered and neither is walked.
    expect(ordered).toEqual([])
  })
})

describe("stepCategory", () => {
  it("returns null in both directions when there are no categories", () => {
    expect(stepCategory([], null, "next")).toBeNull()
    expect(stepCategory([], null, "previous")).toBeNull()
  })

  it("starts at the first category when nothing is selected", () => {
    expect(stepCategory(seededTree(), null, "next")).toBe(1)
  })

  it("starts at the last category when nothing is selected and moving back", () => {
    expect(stepCategory(seededTree(), null, "previous")).toBe(3)
  })

  it("steps into a child folder rather than over it", () => {
    expect(stepCategory(seededTree(), 1, "next")).toBe(2)
  })

  it("steps out of a child folder to the next root", () => {
    expect(stepCategory(seededTree(), 2, "next")).toBe(3)
  })

  it("steps back from a root into the previous root's last child", () => {
    expect(stepCategory(seededTree(), 3, "previous")).toBe(2)
  })

  it("refuses to move past the last category rather than wrapping", () => {
    expect(stepCategory(seededTree(), 3, "next")).toBeNull()
  })

  it("refuses to move before the first category rather than wrapping", () => {
    expect(stepCategory(seededTree(), 1, "previous")).toBeNull()
  })

  it("treats a category that no longer exists as no selection at all", () => {
    expect(stepCategory(seededTree(), 404, "next")).toBe(1)
    expect(stepCategory(seededTree(), 404, "previous")).toBe(3)
  })

  it("moves through a lone category only by refusing both directions", () => {
    const one = [category(1, "Only", null, 0)]

    expect(stepCategory(one, null, "next")).toBe(1)
    expect(stepCategory(one, 1, "next")).toBeNull()
    expect(stepCategory(one, 1, "previous")).toBeNull()
  })
})

describe("categoryAncestorIds", () => {
  it("returns nothing for no category", () => {
    expect(categoryAncestorIds(seededTree(), null)).toEqual([])
  })

  it("returns nothing for an id that is not in the tree", () => {
    expect(categoryAncestorIds(seededTree(), 404)).toEqual([])
  })

  it("lists the category itself first, then each parent above it", () => {
    const tree = [
      category(1, "Technology", null, 0),
      category(2, "Programming", 1, 0),
      category(3, "Rust", 2, 0),
    ]

    expect(categoryAncestorIds(tree, 3)).toEqual([3, 2, 1])
  })

  it("stops on a parent cycle instead of hanging", () => {
    const tree = [category(1, "Loop A", 2, 0), category(2, "Loop B", 1, 0)]

    expect(categoryAncestorIds(tree, 1)).toEqual([1, 2])
  })
})
