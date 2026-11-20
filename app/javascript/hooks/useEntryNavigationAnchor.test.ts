import { renderHook } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { useEntryNavigationAnchor } from "./useEntryNavigationAnchor"

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

  it("anchors on the opened entry once its render lands", () => {
    const { result, rerender } = setup(null)

    result.current.begin(13)
    result.current.settle(true)
    rerender({ selected: 13 })

    expect(result.current.navigationIndex()).toBe(3)
  })
})
