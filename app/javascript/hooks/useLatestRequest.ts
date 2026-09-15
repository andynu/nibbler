import { useCallback, useMemo, useRef } from "react"

/** One request issued through `useLatestRequest`. */
export interface RequestClaim<T> {
  /**
   * What the request was issued for, fixed at claim time. A reply is filed
   * against this rather than against whatever is current when it lands.
   */
  issuedFor: T
  /**
   * True until a later claim or an abandon supersedes this request. Asking does
   * not use the claim up, so a reply handler and a `finally` can both ask.
   */
  isCurrent: () => boolean
}

export interface LatestRequest<T> {
  /** Issue a request, superseding any still in flight. */
  claim: (issuedFor: T) => RequestClaim<T>
  /** Supersede whatever is in flight with no request to replace it. */
  abandon: () => void
}

/**
 * Lets only the most recently issued request write state.
 *
 * Nothing is cancelled: a superseded request still runs and still settles. The
 * caller asks `isCurrent()` before each write and drops the reply when a newer
 * claim, or an abandon, has come since, so which reply wins is decided by the
 * order requests were issued in rather than the order the network answers.
 *
 * `claim` and `abandon` keep their identity across renders and can sit in
 * dependency arrays without re-running anything.
 */
export function useLatestRequest<T = void>(): LatestRequest<T> {
  const latest = useRef(0)

  const claim = useCallback((issuedFor: T): RequestClaim<T> => {
    const issued = ++latest.current
    return { issuedFor, isCurrent: () => issued === latest.current }
  }, [])

  const abandon = useCallback(() => {
    latest.current++
  }, [])

  return useMemo(() => ({ claim, abandon }), [claim, abandon])
}
