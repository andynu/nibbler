import { renderHook } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { useLatestRequest } from "./useLatestRequest"

/** A promise whose settlement this test controls, to force reply ordering. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe("useLatestRequest", () => {
  it("treats a claim as current until another is made", () => {
    const { result } = renderHook(() => useLatestRequest())

    const first = result.current.claim()
    expect(first.isCurrent()).toBe(true)

    const second = result.current.claim()
    expect(first.isCurrent()).toBe(false)
    expect(second.isCurrent()).toBe(true)
  })

  it("supersedes every older claim, not only the one before it", () => {
    const { result } = renderHook(() => useLatestRequest())

    const claims = [result.current.claim(), result.current.claim(), result.current.claim()]

    expect(claims.map((claim) => claim.isCurrent())).toEqual([false, false, true])
  })

  it("gives the same answer however many times it is asked", () => {
    const { result } = renderHook(() => useLatestRequest())

    const claim = result.current.claim()

    // A reply handler checks before writing and a finally block checks again
    // before clearing a loading flag; the first check must not use the claim up.
    expect(claim.isCurrent()).toBe(true)
    expect(claim.isCurrent()).toBe(true)
  })

  it("abandons the request in flight without issuing another", () => {
    const { result } = renderHook(() => useLatestRequest())

    const claim = result.current.claim()
    result.current.abandon()

    expect(claim.isCurrent()).toBe(false)
  })

  it("lets a claim made after an abandon be current", () => {
    const { result } = renderHook(() => useLatestRequest())

    result.current.claim()
    result.current.abandon()
    const next = result.current.claim()

    expect(next.isCurrent()).toBe(true)
  })

  it("never lets a superseded claim become current again", () => {
    const { result } = renderHook(() => useLatestRequest())

    const stale = result.current.claim()
    result.current.claim()
    result.current.abandon()
    result.current.abandon()

    expect(stale.isCurrent()).toBe(false)
  })

  it("hands back what a request was issued for, whatever is claimed after it", () => {
    const { result } = renderHook(() => useLatestRequest<string>())

    const fresh = result.current.claim("fresh")
    result.current.claim("feed-7")

    expect(fresh.issuedFor).toBe("fresh")
  })

  it("drops a slow reply that lands after a newer request", async () => {
    const { result } = renderHook(() => useLatestRequest())
    const slow = deferred<string>()
    const fast = deferred<string>()
    const written: string[] = []

    const issue = (reply: Promise<string>) => {
      const claim = result.current.claim()
      return reply.then((value) => {
        if (claim.isCurrent()) written.push(value)
      })
    }

    const slowDone = issue(slow.promise)
    const fastDone = issue(fast.promise)
    fast.resolve("newer")
    await fastDone
    slow.resolve("older")
    await slowDone

    expect(written).toEqual(["newer"])
  })

  it("keeps claim and abandon stable across renders", () => {
    const { result, rerender } = renderHook(() => useLatestRequest())
    const { claim, abandon } = result.current

    rerender()

    expect(result.current.claim).toBe(claim)
    expect(result.current.abandon).toBe(abandon)
  })

  it("keeps a claim current across a rerender", () => {
    const { result, rerender } = renderHook(() => useLatestRequest())

    const claim = result.current.claim()
    rerender()

    expect(claim.isCurrent()).toBe(true)
  })

  it("gives each caller its own sequence", () => {
    const searches = renderHook(() => useLatestRequest())
    const probes = renderHook(() => useLatestRequest())

    const search = searches.result.current.claim()
    probes.result.current.claim()
    probes.result.current.abandon()

    expect(search.isCurrent()).toBe(true)
  })
})
