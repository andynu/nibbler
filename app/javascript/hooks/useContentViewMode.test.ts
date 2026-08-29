import { renderHook, act } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { useContentViewMode } from "./useContentViewMode"

interface Props {
  contentViewMode: string | undefined
  /**
   * The entry on screen. The hook ignores it; it is here so a test can re-render
   * exactly the way j/k navigation does and assert the view does not reset.
   */
  entryId: number
}

function setup(initialProps: Partial<Props> = {}) {
  return renderHook((props: Props) => useContentViewMode(props.contentViewMode), {
    initialProps: { contentViewMode: "rss", entryId: 1, ...initialProps },
  })
}

describe("useContentViewMode", () => {
  it("starts in RSS view by default", () => {
    const { result } = setup()

    expect(result.current.showIframe).toBe(false)
  })

  it("starts in iframe view when the preference says so", () => {
    const { result } = setup({ contentViewMode: "iframe" })

    expect(result.current.showIframe).toBe(true)
  })

  it("adopts the stored preference once it loads after the first render", () => {
    const { result, rerender } = setup()
    expect(result.current.showIframe).toBe(false)

    // PreferencesProvider serves defaults until the API call resolves.
    rerender({ contentViewMode: "iframe", entryId: 1 })

    expect(result.current.showIframe).toBe(true)
  })

  it("toggles between the two views", () => {
    const { result } = setup()

    act(() => result.current.toggleIframe())
    expect(result.current.showIframe).toBe(true)

    act(() => result.current.toggleIframe())
    expect(result.current.showIframe).toBe(false)
  })

  it("keeps iframe view across entry changes", () => {
    const { result, rerender } = setup()

    act(() => result.current.toggleIframe())
    expect(result.current.showIframe).toBe(true)

    // Walk the list with j/k.
    rerender({ contentViewMode: "rss", entryId: 2 })
    expect(result.current.showIframe).toBe(true)

    rerender({ contentViewMode: "rss", entryId: 3 })
    expect(result.current.showIframe).toBe(true)
  })

  it("keeps RSS view across entry changes when the preference is iframe", () => {
    const { result, rerender } = setup({ contentViewMode: "iframe" })

    act(() => result.current.toggleIframe())
    expect(result.current.showIframe).toBe(false)

    rerender({ contentViewMode: "iframe", entryId: 2 })
    expect(result.current.showIframe).toBe(false)
  })

  it("follows a preference change made in settings", () => {
    const { result, rerender } = setup()

    act(() => result.current.toggleIframe())
    expect(result.current.showIframe).toBe(true)

    rerender({ contentViewMode: "rss", entryId: 1 })
    expect(result.current.showIframe).toBe(true)

    // Changing the stored default is the one thing that overrides the toggle.
    rerender({ contentViewMode: "iframe", entryId: 1 })
    expect(result.current.showIframe).toBe(true)

    rerender({ contentViewMode: "rss", entryId: 1 })
    expect(result.current.showIframe).toBe(false)
  })
})
