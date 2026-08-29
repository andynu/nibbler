import { describe, it, expect } from "vitest"
import { applyUnreadCounts } from "./unreadCounts"

function feed(id: number, unread_count: number, title = `Feed ${id}`) {
  return { id, unread_count, title, category_id: null }
}

describe("applyUnreadCounts", () => {
  it("writes the mapped count onto the matching item", () => {
    const items = [feed(1, 3), feed(2, 0)]

    const next = applyUnreadCounts(items, { 1: 7, 2: 4 })

    expect(next.map((f) => f.unread_count)).toEqual([7, 4])
  })

  it("zeroes an item the map leaves out", () => {
    // GROUP BY ... COUNT omits the zero rows, so absence is the only way the
    // server says "nothing unread here".
    const next = applyUnreadCounts([feed(1, 5), feed(2, 2)], { 2: 2 })

    expect(next[0].unread_count).toBe(0)
  })

  it("leaves every other field alone", () => {
    const next = applyUnreadCounts([feed(1, 3, "Daring Fireball")], { 1: 9 })

    expect(next[0]).toEqual({
      id: 1,
      unread_count: 9,
      title: "Daring Fireball",
      category_id: null,
    })
  })

  it("ignores ids in the map that are not on screen", () => {
    // A feed subscribed in another tab shows up in the counters before the
    // feed list is reloaded. It must not be invented here.
    const next = applyUnreadCounts([feed(1, 1)], { 1: 1, 99: 12 })

    expect(next).toHaveLength(1)
  })

  it("returns the same array when no count moved", () => {
    const items = [feed(1, 3), feed(2, 0)]

    // Identity is the render signal: an unchanged array lets React bail out,
    // which is what leaves the sidebar's scroll position alone.
    expect(applyUnreadCounts(items, { 1: 3 })).toBe(items)
  })

  it("keeps the identity of items whose count did not move", () => {
    const unchanged = feed(1, 3)
    const items = [unchanged, feed(2, 0)]

    const next = applyUnreadCounts(items, { 1: 3, 2: 8 })

    expect(next).not.toBe(items)
    expect(next[0]).toBe(unchanged)
    expect(next[1]).not.toBe(items[1])
  })

  it("returns the same array when the map is missing", () => {
    const items = [feed(1, 3)]

    expect(applyUnreadCounts(items, undefined)).toBe(items)
  })

  it("handles an empty list", () => {
    expect(applyUnreadCounts([], { 1: 4 })).toEqual([])
  })

  it("reads string keys, which is what JSON actually delivers", () => {
    // The response is parsed JSON, so every key is a string however the type
    // is written. Indexing by number has to keep finding them.
    const counts = JSON.parse('{"1": 6}') as Record<number, number>

    expect(applyUnreadCounts([feed(1, 0)], counts)[0].unread_count).toBe(6)
  })
})
