import { describe, it, expect } from "vitest"
import { formatFailingDuration, feedHealthSummary } from "./feedHealth"

// A fixed "now" so nothing here depends on the wall clock.
const NOW = new Date("2026-08-31T12:00:00Z")

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString()
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe("formatFailingDuration", () => {
  it("reports whole minutes under an hour", () => {
    expect(formatFailingDuration(ago(5 * MINUTE), NOW)).toBe("5 minutes")
  })

  it("reports whole hours under a day", () => {
    expect(formatFailingDuration(ago(6 * HOUR), NOW)).toBe("6 hours")
  })

  it("reports whole days under a week", () => {
    expect(formatFailingDuration(ago(3 * DAY), NOW)).toBe("3 days")
  })

  it("reports weeks once the streak passes seven days", () => {
    expect(formatFailingDuration(ago(21 * DAY), NOW)).toBe("3 weeks")
  })

  // The distinction the whole feature exists for: a dead domain has to read
  // differently from a host that hiccuped, using the same error string.
  it("separates a long dead streak from a fresh one", () => {
    expect(formatFailingDuration(ago(40 * DAY), NOW)).toBe("5 weeks")
    expect(formatFailingDuration(ago(10 * MINUTE), NOW)).toBe("10 minutes")
  })

  it("singularizes a count of one", () => {
    expect(formatFailingDuration(ago(1 * DAY), NOW)).toBe("1 day")
    expect(formatFailingDuration(ago(1 * HOUR), NOW)).toBe("1 hour")
  })

  // A streak one millisecond short of two days is still one day, not two.
  it("rounds down rather than up", () => {
    expect(formatFailingDuration(ago(2 * DAY - 1), NOW)).toBe("1 day")
    expect(formatFailingDuration(ago(HOUR - 1), NOW)).toBe("59 minutes")
  })

  it("floors a sub-minute streak instead of saying 0 minutes", () => {
    expect(formatFailingDuration(ago(10_000), NOW)).toBe("less than a minute")
  })

  it("returns null for a missing timestamp", () => {
    expect(formatFailingDuration(null, NOW)).toBeNull()
    expect(formatFailingDuration(undefined, NOW)).toBeNull()
    expect(formatFailingDuration("", NOW)).toBeNull()
  })

  it("returns null rather than NaN for an unparseable timestamp", () => {
    expect(formatFailingDuration("not a date", NOW)).toBeNull()
  })

  // Clock skew between the server and the browser must not render "-3 days".
  it("returns null for a timestamp in the future", () => {
    expect(formatFailingDuration(new Date(NOW.getTime() + HOUR).toISOString(), NOW)).toBeNull()
  })
})

describe("feedHealthSummary", () => {
  it("says nothing for a healthy feed", () => {
    expect(feedHealthSummary({ consecutive_failures: 0 }, NOW)).toBeNull()
  })

  it("says nothing after a single failure", () => {
    expect(
      feedHealthSummary({ consecutive_failures: 1, first_failed_at: ago(MINUTE) }, NOW)
    ).toBeNull()
  })

  it("reports duration and attempt count once the streak is real", () => {
    expect(
      feedHealthSummary({ consecutive_failures: 12, first_failed_at: ago(3 * DAY) }, NOW)
    ).toBe("Failing for 3 days (12 attempts)")
  })

  it("still reports the count when the server sent no start time", () => {
    expect(feedHealthSummary({ consecutive_failures: 4, first_failed_at: null }, NOW)).toBe(
      "Failing (4 attempts)"
    )
  })

  // A feed serialized before first_failed_at existed sends neither field. It
  // must render as healthy, not crash and not claim "Failing (undefined)".
  it("treats a feed with no failure fields as healthy", () => {
    expect(feedHealthSummary({}, NOW)).toBeNull()
  })

  it("singularizes nothing at the two-attempt boundary", () => {
    expect(
      feedHealthSummary({ consecutive_failures: 2, first_failed_at: ago(HOUR) }, NOW)
    ).toBe("Failing for 1 hour (2 attempts)")
  })
})
