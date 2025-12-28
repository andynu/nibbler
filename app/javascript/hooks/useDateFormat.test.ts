import { renderHook } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import React from "react"
import { useDateFormat } from "./useDateFormat"

// Mock the PreferencesContext
const mockPreferences = {
  date_format: "relative",
}

vi.mock("@/contexts/PreferencesContext", () => ({
  usePreferences: () => ({
    preferences: mockPreferences,
  }),
}))

describe("useDateFormat", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Set a fixed time for consistent testing
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"))
    // Reset to default
    mockPreferences.date_format = "relative"
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("formatDate with relative style", () => {
    it('returns "now" for dates less than 1 minute ago', () => {
      const { result } = renderHook(() => useDateFormat())

      // 30 seconds ago
      const date = new Date("2025-01-15T11:59:30Z")
      expect(result.current.formatDate(date)).toBe("now")
    })

    it('returns "Xm ago" for dates less than 1 hour ago', () => {
      const { result } = renderHook(() => useDateFormat())

      // 15 minutes ago
      const date = new Date("2025-01-15T11:45:00Z")
      expect(result.current.formatDate(date)).toBe("15m ago")

      // 59 minutes ago
      const date2 = new Date("2025-01-15T11:01:00Z")
      expect(result.current.formatDate(date2)).toBe("59m ago")
    })

    it('returns "Xh ago" for dates less than 24 hours ago', () => {
      const { result } = renderHook(() => useDateFormat())

      // 3 hours ago
      const date = new Date("2025-01-15T09:00:00Z")
      expect(result.current.formatDate(date)).toBe("3h ago")

      // 23 hours ago
      const date2 = new Date("2025-01-14T13:00:00Z")
      expect(result.current.formatDate(date2)).toBe("23h ago")
    })

    it('returns "Xd ago" for dates less than 7 days ago', () => {
      const { result } = renderHook(() => useDateFormat())

      // 2 days ago
      const date = new Date("2025-01-13T12:00:00Z")
      expect(result.current.formatDate(date)).toBe("2d ago")

      // 6 days ago
      const date2 = new Date("2025-01-09T12:00:00Z")
      expect(result.current.formatDate(date2)).toBe("6d ago")
    })

    it('returns "Mon D" format for dates 7+ days ago in current year', () => {
      const { result } = renderHook(() => useDateFormat())

      // 10 days ago (Jan 5)
      const date = new Date("2025-01-05T12:00:00Z")
      const formatted = result.current.formatDate(date)
      // Should contain "Jan" and "5" but not year
      expect(formatted).toMatch(/Jan/)
      expect(formatted).toMatch(/5/)
      expect(formatted).not.toMatch(/25/)
      expect(formatted).not.toMatch(/2025/)
    })

    it('returns "Mon D, YY" format for dates 7+ days ago in previous year', () => {
      const { result } = renderHook(() => useDateFormat())

      // Previous year (Dec 2024)
      const date = new Date("2024-12-15T12:00:00Z")
      const formatted = result.current.formatDate(date)
      // Should contain "Dec", "15", and "24" (2-digit year)
      expect(formatted).toMatch(/Dec/)
      expect(formatted).toMatch(/15/)
      expect(formatted).toMatch(/24/)
    })
  })

  describe("formatDate with different styles", () => {
    it("uses short format when style is short", () => {
      mockPreferences.date_format = "short"
      const { result } = renderHook(() => useDateFormat())

      const date = new Date("2025-01-15T09:30:00Z")
      const formatted = result.current.formatDate(date)
      // Short format includes month, day, hour, minute
      expect(formatted).toMatch(/Jan/)
      expect(formatted).toMatch(/15/)
    })

    it("uses long format when style is long", () => {
      mockPreferences.date_format = "long"
      const { result } = renderHook(() => useDateFormat())

      const date = new Date("2025-01-15T09:30:00Z")
      const formatted = result.current.formatDate(date)
      // Long format includes weekday, year, month, day, hour, minute
      expect(formatted).toMatch(/Wed/)
      expect(formatted).toMatch(/2025/)
      expect(formatted).toMatch(/Jan/)
      expect(formatted).toMatch(/15/)
    })

    it("uses ISO format when style is iso", () => {
      mockPreferences.date_format = "iso"
      const { result } = renderHook(() => useDateFormat())

      const date = new Date("2025-01-15T09:30:00Z")
      const formatted = result.current.formatDate(date)
      // ISO format: YYYY-MM-DD HH:MM
      expect(formatted).toBe("2025-01-15 09:30")
    })

    it("defaults to relative when style is unknown", () => {
      mockPreferences.date_format = "unknown" as any
      const { result } = renderHook(() => useDateFormat())

      // 5 minutes ago
      const date = new Date("2025-01-15T11:55:00Z")
      expect(result.current.formatDate(date)).toBe("5m ago")
    })
  })

  describe("formatDate with override style", () => {
    it("uses override style instead of preference", () => {
      mockPreferences.date_format = "relative"
      const { result } = renderHook(() => useDateFormat())

      const date = new Date("2025-01-15T09:30:00Z")

      // Override with ISO
      const formatted = result.current.formatDate(date, "iso")
      expect(formatted).toBe("2025-01-15 09:30")
    })
  })

  describe("formatDate input handling", () => {
    it("accepts Date object", () => {
      const { result } = renderHook(() => useDateFormat())

      const date = new Date("2025-01-15T11:55:00Z")
      expect(result.current.formatDate(date)).toBe("5m ago")
    })

    it("accepts ISO date string", () => {
      const { result } = renderHook(() => useDateFormat())

      expect(result.current.formatDate("2025-01-15T11:55:00Z")).toBe("5m ago")
    })
  })

  describe("formatListDate", () => {
    it("uses relative format when preference is relative", () => {
      mockPreferences.date_format = "relative"
      const { result } = renderHook(() => useDateFormat())

      // 30 minutes ago
      const date = new Date("2025-01-15T11:30:00Z")
      expect(result.current.formatListDate(date)).toBe("30m ago")
    })

    it("includes year for previous year dates in relative mode", () => {
      mockPreferences.date_format = "relative"
      const { result } = renderHook(() => useDateFormat())

      // Previous year (more than 7 days ago, so falls back to Mon D, YY format)
      const date = new Date("2024-12-15T12:00:00Z")
      const formatted = result.current.formatListDate(date)
      // Should contain "Dec", "15", and "24" (2-digit year)
      expect(formatted).toMatch(/Dec/)
      expect(formatted).toMatch(/15/)
      expect(formatted).toMatch(/24/)
    })

    it('uses "Mon D" for non-relative styles in current year', () => {
      mockPreferences.date_format = "short"
      const { result } = renderHook(() => useDateFormat())

      const date = new Date("2025-01-15T11:30:00Z")
      const formatted = result.current.formatListDate(date)
      expect(formatted).toMatch(/Jan/)
      expect(formatted).toMatch(/15/)
      // Should NOT include time for list dates
      expect(formatted).not.toMatch(/\d{2}:\d{2}/)
      // Should NOT include year for current year
      expect(formatted).not.toMatch(/25/)
      expect(formatted).not.toMatch(/2025/)
    })

    it('uses "Mon D, YY" for non-relative styles in previous year', () => {
      mockPreferences.date_format = "short"
      const { result } = renderHook(() => useDateFormat())

      const date = new Date("2024-12-25T11:30:00Z")
      const formatted = result.current.formatListDate(date)
      expect(formatted).toMatch(/Dec/)
      expect(formatted).toMatch(/25/)
      // Should include 2-digit year for previous year
      expect(formatted).toMatch(/24/)
      // Should NOT include time for list dates
      expect(formatted).not.toMatch(/\d{2}:\d{2}/)
    })

    it("accepts ISO string input", () => {
      mockPreferences.date_format = "relative"
      const { result } = renderHook(() => useDateFormat())

      expect(result.current.formatListDate("2025-01-15T11:30:00Z")).toBe(
        "30m ago"
      )
    })
  })

  describe("formatReaderDate", () => {
    it("shows long date even when preference is relative", () => {
      mockPreferences.date_format = "relative"
      const { result } = renderHook(() => useDateFormat())

      const date = new Date("2025-01-15T09:30:00Z")
      const formatted = result.current.formatReaderDate(date)
      // Should show full long date, not relative
      expect(formatted).toMatch(/Wed/)
      expect(formatted).toMatch(/2025/)
      expect(formatted).toMatch(/Jan/)
      expect(formatted).toMatch(/15/)
    })

    it("respects short style for reader view", () => {
      mockPreferences.date_format = "short"
      const { result } = renderHook(() => useDateFormat())

      const date = new Date("2025-01-15T09:30:00Z")
      const formatted = result.current.formatReaderDate(date)
      expect(formatted).toMatch(/Jan/)
      expect(formatted).toMatch(/15/)
    })

    it("respects long style for reader view", () => {
      mockPreferences.date_format = "long"
      const { result } = renderHook(() => useDateFormat())

      const date = new Date("2025-01-15T09:30:00Z")
      const formatted = result.current.formatReaderDate(date)
      expect(formatted).toMatch(/Wed/)
      expect(formatted).toMatch(/2025/)
    })

    it("respects iso style for reader view", () => {
      mockPreferences.date_format = "iso"
      const { result } = renderHook(() => useDateFormat())

      const date = new Date("2025-01-15T09:30:00Z")
      expect(result.current.formatReaderDate(date)).toBe("2025-01-15 09:30")
    })

    it("accepts ISO string input", () => {
      mockPreferences.date_format = "iso"
      const { result } = renderHook(() => useDateFormat())

      expect(result.current.formatReaderDate("2025-01-15T09:30:00Z")).toBe(
        "2025-01-15 09:30"
      )
    })
  })

  describe("style property", () => {
    it("returns the current style from preferences", () => {
      mockPreferences.date_format = "short"
      const { result } = renderHook(() => useDateFormat())

      expect(result.current.style).toBe("short")
    })
  })
})
