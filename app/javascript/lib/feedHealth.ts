/**
 * Turning a feed's failure counters into something a person can act on.
 *
 * The error text alone does not distinguish the two cases that matter. "Feed not
 * found" on its first cycle is probably a deploy in progress somewhere; the same
 * string on its two-hundredth cycle means the feed moved months ago and is never
 * coming back. What separates them is how long the streak has run, which is why
 * the server sends first_failed_at alongside the message.
 */

/** The subset of Feed these helpers read. Keeps them usable from any call site. */
export interface FeedHealthFields {
  last_error?: string | null
  consecutive_failures?: number
  first_failed_at?: string | null
  broken?: boolean
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

function pluralize(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`
}

/**
 * How long a failing streak has run, phrased as a duration rather than a date.
 *
 * "3 weeks" is the thing that makes a reader unsubscribe; "since 12 August"
 * makes them do the subtraction themselves. Rounds down to the largest whole
 * unit, so anything under a minute reads "less than a minute".
 *
 * Returns null for a missing, empty or unparseable timestamp, and for one in
 * the future, so a call site can simply omit the line rather than render
 * "NaN days".
 */
export function formatFailingDuration(
  firstFailedAt: string | null | undefined,
  now: Date = new Date()
): string | null {
  if (!firstFailedAt) return null

  const started = new Date(firstFailedAt).getTime()
  if (Number.isNaN(started)) return null

  const elapsed = now.getTime() - started
  if (elapsed < 0) return null

  if (elapsed < MINUTE) return "less than a minute"
  if (elapsed < HOUR) return pluralize(Math.floor(elapsed / MINUTE), "minute")
  if (elapsed < DAY) return pluralize(Math.floor(elapsed / HOUR), "hour")
  if (elapsed < WEEK) return pluralize(Math.floor(elapsed / DAY), "day")
  return pluralize(Math.floor(elapsed / WEEK), "week")
}

/**
 * The one-line health summary shown next to a feed's error text, or null when
 * there is nothing worth adding.
 *
 * Stays quiet on a single failure: one miss is noise, and captioning it
 * "Failing for less than a minute (1 attempt)" trains people to ignore the
 * caption by the time it means something. From the second failure on it reports
 * the duration and the attempt count together, because either alone is
 * ambiguous - a big count over a short window is a flapping host, a small count
 * over a long window is a feed backed off to its daily cap.
 */
export function feedHealthSummary(
  feed: FeedHealthFields,
  now: Date = new Date()
): string | null {
  const failures = feed.consecutive_failures ?? 0
  if (failures < 2) return null

  const duration = formatFailingDuration(feed.first_failed_at, now)
  const attempts = pluralize(failures, "attempt")

  return duration ? `Failing for ${duration} (${attempts})` : `Failing (${attempts})`
}
