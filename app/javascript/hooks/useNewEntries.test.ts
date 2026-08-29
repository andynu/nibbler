import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { useNewEntries, NewEntriesOptions } from "./useNewEntries"
import { mockEntry } from "../../../test/fixtures/data"
import type { Entry } from "@/lib/api"

const INTERVAL = 1000

function entries(...ids: number[]): Entry[] {
  return ids.map((id) => mockEntry({ id, title: `Entry ${id}` }))
}

/** Advance past one probe interval and let the fetch promise settle. */
async function tick(times = 1) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(INTERVAL * times)
  })
}

function setup(overrides: Partial<NewEntriesOptions> = {}) {
  const props: NewEntriesOptions = {
    entries: entries(1, 2),
    fetchEntries: vi.fn().mockResolvedValue(entries(1, 2)),
    onApply: vi.fn(),
    scope: "fresh",
    intervalMs: INTERVAL,
    ...overrides,
  }

  const rendered = renderHook((next: NewEntriesOptions) => useNewEntries(next), {
    initialProps: props,
  })

  return { ...rendered, props }
}

describe("useNewEntries", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // useBackgroundRefresh only runs a timer while the tab is visible.
    Object.defineProperty(document, "hidden", { configurable: true, value: false })
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("probes nothing on mount", () => {
    const { result, props } = setup()

    expect(props.fetchEntries).not.toHaveBeenCalled()
    expect(result.current.count).toBe(0)
  })

  it("counts the probed entries the list does not hold yet", async () => {
    const { result } = setup({
      entries: entries(1, 2),
      fetchEntries: vi.fn().mockResolvedValue(entries(4, 3, 1, 2)),
    })

    await tick()

    expect(result.current.count).toBe(2)
  })

  it("counts nothing when the probe comes back with the same entries", async () => {
    const { result } = setup({
      entries: entries(1, 2),
      fetchEntries: vi.fn().mockResolvedValue(entries(1, 2)),
    })

    await tick()

    expect(result.current.count).toBe(0)
  })

  it("leaves the list alone while it probes", async () => {
    const { result, props } = setup({
      entries: entries(1, 2),
      fetchEntries: vi.fn().mockResolvedValue(entries(9, 8, 1, 2)),
    })

    await tick(3)

    // The whole point: nothing is handed to the list, so the open article and
    // the reader's scroll position survive every tick.
    expect(props.onApply).not.toHaveBeenCalled()
    expect(result.current.count).toBe(2)
  })

  it("hands the probed list over only when the reader asks", async () => {
    const probed = entries(9, 8, 1, 2)
    const { result, props } = setup({
      entries: entries(1, 2),
      fetchEntries: vi.fn().mockResolvedValue(probed),
    })

    await tick()
    act(() => result.current.apply())

    expect(props.onApply).toHaveBeenCalledTimes(1)
    expect(props.onApply).toHaveBeenCalledWith(probed)
  })

  it("drops the count once the probe has been applied", async () => {
    const { result } = setup({
      entries: entries(1, 2),
      fetchEntries: vi.fn().mockResolvedValue(entries(9, 1, 2)),
    })

    await tick()
    act(() => result.current.apply())

    expect(result.current.count).toBe(0)
  })

  it("does nothing on apply when no probe has landed", () => {
    const { result, props } = setup()

    act(() => result.current.apply())

    expect(props.onApply).not.toHaveBeenCalled()
  })

  it("keeps counting across a rewrite that leaves the ids alone", async () => {
    const shown = entries(1, 2)
    const { result, rerender, props } = setup({
      entries: shown,
      fetchEntries: vi.fn().mockResolvedValue(entries(9, 1, 2)),
    })

    await tick()
    expect(result.current.count).toBe(1)

    // Marking an entry read replaces the array without changing which entries
    // are on screen. The count must not blink out.
    rerender({
      ...props,
      entries: shown.map((entry) => ({ ...entry, unread: false })),
    })

    expect(result.current.count).toBe(1)
  })

  it("forgets a probe taken from a list the reader has left", async () => {
    const { result, rerender, props } = setup({
      entries: entries(1, 2),
      scope: "fresh",
      fetchEntries: vi.fn().mockResolvedValue(entries(9, 8, 1, 2)),
    })

    await tick()
    expect(result.current.count).toBe(2)

    // A different feed: the stored probe describes entries that have nothing
    // to do with what is now on screen.
    rerender({ ...props, scope: "feed-7", entries: entries(50, 51) })

    expect(result.current.count).toBe(0)
  })

  it("discards a probe that lands after the reader has moved on", async () => {
    let settle: (value: Entry[]) => void = () => {}
    const fetchEntries = vi.fn(
      () => new Promise<Entry[]>((resolve) => { settle = resolve })
    )
    const { result, rerender, props } = setup({ entries: entries(1, 2), fetchEntries })

    await tick()
    rerender({ ...props, fetchEntries, scope: "feed-7", entries: entries(50, 51) })
    await act(async () => {
      settle(entries(9, 8, 1, 2))
      await Promise.resolve()
    })

    expect(result.current.count).toBe(0)
  })

  it("forgets the stored probe on reset", async () => {
    const { result } = setup({
      entries: entries(1, 2),
      fetchEntries: vi.fn().mockResolvedValue(entries(9, 1, 2)),
    })

    await tick()
    expect(result.current.count).toBe(1)

    act(() => result.current.reset())

    expect(result.current.count).toBe(0)
  })

  it("abandons an in-flight probe on reset", async () => {
    let settle: (value: Entry[]) => void = () => {}
    const fetchEntries = vi.fn(
      () => new Promise<Entry[]>((resolve) => { settle = resolve })
    )
    const { result } = setup({ entries: entries(1, 2), fetchEntries })

    await tick()
    act(() => result.current.reset())
    await act(async () => {
      settle(entries(9, 1, 2))
      await Promise.resolve()
    })

    expect(result.current.count).toBe(0)
  })

  it("keeps the last count when a probe fails", async () => {
    const fetchEntries = vi
      .fn()
      .mockResolvedValueOnce(entries(9, 1, 2))
      .mockRejectedValueOnce(new Error("network down"))
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const { result } = setup({ entries: entries(1, 2), fetchEntries })

    await tick()
    expect(result.current.count).toBe(1)

    await tick()

    expect(result.current.count).toBe(1)
    expect(consoleError).toHaveBeenCalled()
  })

  it("probes nothing while disabled", async () => {
    const { result, props } = setup({ enabled: false })

    await tick(5)

    expect(props.fetchEntries).not.toHaveBeenCalled()
    expect(result.current.count).toBe(0)
  })

  it("starts probing once it is re-enabled", async () => {
    const fetchEntries = vi.fn().mockResolvedValue(entries(9, 1, 2))
    const { result, rerender, props } = setup({
      entries: entries(1, 2),
      fetchEntries,
      enabled: false,
    })

    rerender({ ...props, fetchEntries, enabled: true })
    await tick()

    expect(result.current.count).toBe(1)
  })
})
