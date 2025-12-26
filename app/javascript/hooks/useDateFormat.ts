import { useCallback } from "react"
import { usePreferences } from "@/contexts/PreferencesContext"

type DateFormatStyle = "relative" | "short" | "long" | "iso"

function formatRelativeDate(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 16).replace("T", " ")
}

export function useDateFormat() {
  const { preferences } = usePreferences()
  const style = preferences.date_format as DateFormatStyle

  const formatDate = useCallback(
    (dateInput: Date | string, overrideStyle?: DateFormatStyle): string => {
      const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput
      const useStyle = overrideStyle || style

      switch (useStyle) {
        case "relative":
          return formatRelativeDate(date)
        case "short":
          return formatShortDate(date)
        case "long":
          return formatLongDate(date)
        case "iso":
          return formatIsoDate(date)
        default:
          return formatRelativeDate(date)
      }
    },
    [style]
  )

  // Format for entry list (shorter)
  const formatListDate = useCallback(
    (dateInput: Date | string): string => {
      const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput

      if (style === "relative") {
        return formatRelativeDate(date)
      }
      // For non-relative, use short format in list
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    },
    [style]
  )

  // Format for article reader (longer)
  const formatReaderDate = useCallback(
    (dateInput: Date | string): string => {
      const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput

      switch (style) {
        case "relative":
          // For reader, show full date even in relative mode
          return formatLongDate(date)
        case "short":
          return formatShortDate(date)
        case "long":
          return formatLongDate(date)
        case "iso":
          return formatIsoDate(date)
        default:
          return formatLongDate(date)
      }
    },
    [style]
  )

  return { formatDate, formatListDate, formatReaderDate, style }
}
