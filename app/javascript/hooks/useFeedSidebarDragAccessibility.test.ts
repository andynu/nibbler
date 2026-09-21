import { renderHook } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import type { Announcements, UniqueIdentifier } from "@dnd-kit/core"
import { useFeedSidebarDragAccessibility } from "./useFeedSidebarDragAccessibility"
import { mockFeed, mockCategory } from "../../../test/fixtures/data"

// The sidebar's DndContext has pointer sensors only, so a rendered drag cannot
// be driven from the keyboard in a test. The announcements are a function of
// the ids dnd-kit reports, which is what these call directly.
type Active = Parameters<Announcements["onDragStart"]>[0]["active"]
type Over = Parameters<Announcements["onDragOver"]>[0]["over"]

const active = (id: UniqueIdentifier) => ({ id }) as unknown as Active
const over = (id: UniqueIdentifier) => ({ id }) as unknown as Over

const categories = [mockCategory({ id: 1, title: "Tech" }), mockCategory({ id: 2, title: "News" })]
const feeds = [
  mockFeed({ id: 10, title: "First Feed", category_id: 1 }),
  mockFeed({ id: 11, title: "Loose Feed", category_id: null }),
]

function announcements() {
  const { result } = renderHook(() => useFeedSidebarDragAccessibility(feeds, categories))
  return result.current.announcements
}

describe("useFeedSidebarDragAccessibility", () => {
  it("names the feed when one is picked up", () => {
    expect(announcements().onDragStart({ active: active(10) })).toBe("Picked up First Feed.")
  })

  it("names the category a lifted feed is over", () => {
    const a = announcements()
    a.onDragStart({ active: active(10) })

    expect(a.onDragOver({ active: active(10), over: over("category-2") })).toBe(
      "First Feed is over News."
    )
  })

  it("says nothing while a feed stays over the same category", () => {
    const a = announcements()
    a.onDragStart({ active: active(10) })
    a.onDragOver({ active: active(10), over: over("category-2") })

    expect(a.onDragOver({ active: active(10), over: over("category-2") })).toBeUndefined()
  })

  it("names the category a dropped feed moves into", () => {
    expect(announcements().onDragEnd({ active: active(10), over: over("category-2") })).toBe(
      "Moved First Feed to News."
    )
  })

  it("says a feed dropped back on its own category is already there", () => {
    expect(announcements().onDragEnd({ active: active(10), over: over("category-1") })).toBe(
      "First Feed is already in Tech."
    )
  })

  it("says nothing moved when a feed is dropped outside every category", () => {
    expect(announcements().onDragEnd({ active: active(11), over: null })).toBe(
      "Dropped Loose Feed. Nothing moved."
    )
  })

  it("names the feed a canceled move leaves where it was", () => {
    expect(announcements().onDragCancel({ active: active(10), over: null })).toBe(
      "Move canceled. First Feed is back where it was."
    )
  })
})
