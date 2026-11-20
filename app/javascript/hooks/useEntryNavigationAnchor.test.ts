import { renderHook } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { navigationList, useEntryNavigationAnchor } from "./useEntryNavigationAnchor"

const entries = [{ id: 10 }, { id: 11 }, { id: 12 }, { id: 13 }]

function setup(selectedEntryId: number | null = null) {
  return renderHook(
    ({ selected }) => useEntryNavigationAnchor(entries, selected),
    { initialProps: { selected: selectedEntryId } }
  )
}

describe("useEntryNavigationAnchor", () => {
  it("anchors on the rendered selection when nothing is in flight", () => {
    const { result } = setup(12)

    expect(result.current.navigationIndex()).toBe(2)
  })

  it("has no anchor with nothing selected and nothing in flight", () => {
    const { result } = setup(null)

    expect(result.current.navigationIndex()).toBe(-1)
  })

  it("anchors on the entry in flight ahead of the selection", () => {
    const { result } = setup(12)

    result.current.begin(11)

    expect(result.current.navigationIndex()).toBe(1)
  })

  it("falls back to the selection when the entry in flight is not in the list", () => {
    const { result } = setup(12)

    result.current.begin(99)

    expect(result.current.navigationIndex()).toBe(2)
  })

  it("returns to the selection once a failed load settles", () => {
    const { result } = setup(12)

    result.current.begin(11)
    result.current.settle(false)

    expect(result.current.navigationIndex()).toBe(2)
  })

  it("returns to the selection once dropped", () => {
    const { result, rerender } = setup(12)

    result.current.begin(11)
    result.current.drop()
    rerender({ selected: null })

    expect(result.current.navigationIndex()).toBe(-1)
  })

  // The reply sets the selection and settles in one go, but the keyboard
  // listener keeps the previous commit's selection until React renders. A
  // press in that gap moved from the old selection, so k, k, k from nothing
  // opened the last entry twice and stopped one row short.
  it("anchors on an opened entry before its render lands", () => {
    const { result } = setup(null)

    result.current.begin(13)
    result.current.settle(true)

    expect(result.current.navigationIndex()).toBe(3)
  })

  it("anchors on the opened entry once its render lands", () => {
    const { result, rerender } = setup(null)

    result.current.begin(13)
    result.current.settle(true)
    rerender({ selected: 13 })

    expect(result.current.navigationIndex()).toBe(3)
  })

  it("anchors on an opened search hit in the order the results are shown", () => {
    const hits = [{ id: 7 }, { id: 3 }, { id: 9 }]
    const { result } = renderHook(() => useEntryNavigationAnchor(hits, 3))

    expect(result.current.navigationIndex()).toBe(1)
  })
})

describe("navigationList", () => {
  const listed = [
    { id: 1, unread: true, title: "Listed one" },
    { id: 2, unread: false, title: "Listed two" },
  ]
  const hits = [
    { id: 7, unread: false, title: "Hit seven" },
    { id: 3, unread: true, title: "Hit three" },
  ]

  it("is the search results while a search is active", () => {
    expect(navigationList(listed, { isActive: true, results: hits })).toBe(hits)
  })

  // Falling through to the hidden list would open, and mark read, articles
  // nobody can see.
  it("is the empty result set rather than the hidden list while hits are pending", () => {
    expect(navigationList(listed, { isActive: true, results: [] })).toEqual([])
  })

  it("is the entry list once the search is cleared", () => {
    expect(navigationList(listed, { isActive: false, results: hits })).toBe(listed)
  })
})
