import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useBackgroundRefresh } from "@/hooks/useBackgroundRefresh"
import type { Entry } from "@/lib/api"

export interface NewEntriesOptions {
  /** The list currently on screen. "New" means "not in here, by id". */
  entries: Entry[]
  /** Refetch the current list with the parameters the visible list was built from. */
  fetchEntries: () => Promise<Entry[]>
  /** Hand a probed list to the list state. Called from `apply()`, never from a probe. */
  onApply: (entries: Entry[]) => void
  /**
   * Whatever identifies the list being probed - in practice the memoized
   * entries query. Compared by identity (`Object.is`): when it changes, a
   * stored probe belongs to a list the reader has left and is discarded
   * rather than counted against the new one.
   */
  scope: unknown
  /** Set false to suspend probing (stories view, settings dialog). */
  enabled?: boolean
  /** Milliseconds between probes; defaults to the background refresh interval. */
  intervalMs?: number
}

export interface NewEntries {
  /** How many probed entries are not on screen yet. Zero means show nothing. */
  count: number
  /** Swap the probed list in. No-op when there is nothing stored. */
  apply: () => void
  /** Forget the stored probe and abandon any in flight. */
  reset: () => void
}

interface Probe {
  scope: unknown
  entries: Entry[]
}

/**
 * Poll the current entry list in the background and report how much of it the
 * reader has not seen, without touching the list itself.
 *
 * The entry list only reloads when the selection, sort or filters change, so a
 * reader parked on Fresh watches the badge climb while the list under it sits
 * still (ttrb-v565). Folding the list into the background tick is the obvious
 * fix and the wrong one: `loadEntries` resets `selectedEntry` to null and
 * replaces every row, so a poll would close the open article and throw away
 * the reader's place in the list once a minute.
 *
 * So the probe writes nowhere the reader can see. It fetches the same query
 * the visible list came from, keeps the response to one side, and publishes a
 * count. Nothing reaches `entries` until `apply()` - a click on the "N new
 * articles" affordance - hands the stored response over.
 *
 * The count is derived, not stored, which is what keeps it honest across the
 * things that happen between probes: marking an entry read rewrites `entries`
 * without changing its ids, so the count survives; a real reload pulls the new
 * entries in for real, so the count falls out to zero on its own.
 *
 * `reset()` still exists because a reload can also drop entries off the tail
 * of a `per_page` window. Those would read as "new" against a stale probe, so
 * `loadEntries` throws the probe away rather than letting it count backwards.
 */
export function useNewEntries({
  entries,
  fetchEntries,
  onApply,
  scope,
  enabled = true,
  intervalMs,
}: NewEntriesOptions): NewEntries {
  const [probe, setProbe] = useState<Probe | null>(null)

  const fetchRef = useRef(fetchEntries)
  const onApplyRef = useRef(onApply)
  const scopeRef = useRef(scope)

  useEffect(() => {
    fetchRef.current = fetchEntries
    onApplyRef.current = onApply
    scopeRef.current = scope
  })

  // Bumped by every probe and by reset(); a response may only be stored while
  // its sequence is still current, so a slow reply cannot land after the
  // reader has moved on.
  const probeSeq = useRef(0)

  useBackgroundRefresh(
    () => {
      const seq = ++probeSeq.current
      const probedScope = scopeRef.current
      fetchRef
        .current()
        .then((probed) => {
          if (seq !== probeSeq.current) return
          setProbe({ scope: probedScope, entries: probed })
        })
        .catch((error: unknown) => {
          console.error("Failed to probe for new entries:", error)
        })
    },
    { enabled, intervalMs }
  )

  const current = probe && Object.is(probe.scope, scope) ? probe : null

  const count = useMemo(() => {
    if (!current) return 0
    const onScreen = new Set(entries.map((entry) => entry.id))
    return current.entries.filter((entry) => !onScreen.has(entry.id)).length
  }, [current, entries])

  const reset = useCallback(() => {
    probeSeq.current++
    setProbe(null)
  }, [])

  const apply = useCallback(() => {
    if (!current) return
    probeSeq.current++
    onApplyRef.current(current.entries)
    setProbe(null)
  }, [current])

  return { count, apply, reset }
}
