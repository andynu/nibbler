import { describe, it, expect } from "vitest"
import { buildCategoryPaths, filterCategoryPaths } from "./categoryPaths"
import { mockCategory } from "../../../test/fixtures/data"

describe("buildCategoryPaths", () => {
  it("returns an empty list for no categories", () => {
    expect(buildCategoryPaths([])).toEqual([])
  })

  it("gives a root category its own title as its path and a depth of 0", () => {
    const tech = mockCategory({ id: 1, title: "Tech" })

    expect(buildCategoryPaths([tech])).toEqual([
      { category: tech, path: ["Tech"], depth: 0 },
    ])
  })

  it("gives a nested category its ancestors' titles, root first, and counts them as its depth", () => {
    const tech = mockCategory({ id: 1, title: "Tech" })
    const programming = mockCategory({ id: 2, title: "Programming", parent_id: 1 })
    const ruby = mockCategory({ id: 3, title: "Ruby", parent_id: 2 })

    const rubyEntry = buildCategoryPaths([ruby, programming, tech]).find(
      (item) => item.category === ruby
    )

    expect(rubyEntry).toEqual({
      category: ruby,
      path: ["Tech", "Programming", "Ruby"],
      depth: 2,
    })
  })

  it("orders by the full path, so children follow their parent and the server's order is not kept", () => {
    const tech = mockCategory({ id: 1, title: "Tech", order_id: 0 })
    const news = mockCategory({ id: 2, title: "News", order_id: 1 })
    const programming = mockCategory({ id: 3, title: "Programming", parent_id: 1 })
    const local = mockCategory({ id: 4, title: "Local", parent_id: 2 })

    const paths = buildCategoryPaths([tech, news, programming, local]).map(
      (item) => item.path.join(" / ")
    )

    expect(paths).toEqual(["News", "News / Local", "Tech", "Tech / Programming"])
  })
})

describe("filterCategoryPaths", () => {
  const tech = mockCategory({ id: 1, title: "Tech" })
  const programming = mockCategory({ id: 2, title: "Programming", parent_id: 1 })
  const news = mockCategory({ id: 3, title: "News" })
  const items = buildCategoryPaths([tech, programming, news])

  const titlesOf = (search: string) =>
    filterCategoryPaths(items, search).map((item) => item.category.title)

  it("keeps every entry when the search is empty or only whitespace", () => {
    expect(filterCategoryPaths(items, "")).toBe(items)
    expect(filterCategoryPaths(items, "   ")).toBe(items)
  })

  it("matches part of a title regardless of case", () => {
    expect(titlesOf("NEW")).toEqual(["News"])
  })

  it("keeps a category whose ancestor matches, so a parent's name finds its children", () => {
    expect(titlesOf("tech")).toEqual(["Tech", "Programming"])
  })

  it("drops every entry when nothing in any path matches", () => {
    expect(titlesOf("xyz")).toEqual([])
  })
})
