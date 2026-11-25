import { describe, it, expect } from "vitest"
import { autoTagScope } from "./auto-tag-scope"

describe("autoTagScope", () => {
  it("carries the feed a search was narrowed to", () => {
    expect(autoTagScope({ feed_id: 7 }, "list", { feed: "Ruby Weekly" })).toEqual({
      scope: { feed_id: 7 },
      scopeName: "Ruby Weekly",
      note: null,
    })
  })

  it("carries the category a search was narrowed to", () => {
    expect(autoTagScope({ category_id: 3 }, "list", { category: "Programming" })).toEqual({
      scope: { category_id: 3 },
      scopeName: "Programming",
      note: null,
    })
  })

  it("covers all feeds once the place pill is widened", () => {
    expect(autoTagScope({ feed_id: 7 }, "everything", { feed: "Ruby Weekly" })).toEqual({
      scope: {},
      scopeName: "All feeds",
      note: null,
    })
  })

  it("saves a tag-scoped search as all feeds and says so", () => {
    expect(autoTagScope({ tag: "ruby" }, "list")).toEqual({
      scope: {},
      scopeName: "All feeds",
      note: "Auto-tags can't be limited to #ruby, so this one covers all feeds.",
    })
  })

  it("says when a feed rule covers more than the starred articles shown", () => {
    const { scope, note } = autoTagScope({ feed_id: 7, starred: true }, "list", { feed: "Ruby Weekly" })

    expect(scope).toEqual({ feed_id: 7 })
    expect(note).toBe(
      "Auto-tags can't be limited to starred articles, so this one covers every article in Ruby Weekly."
    )
  })

  it("ignores read state, which rules do not carry", () => {
    expect(autoTagScope({ unread: true, view: "fresh" }, "list").note).toBeNull()
  })
})
