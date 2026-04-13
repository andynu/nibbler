import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Generate a UUID, with fallback for non-secure contexts (HTTP in Firefox)
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback using crypto.getRandomValues (more widely available)
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      +c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
    ).toString(16)
  )
}

// Error category types for grouping feed errors
export type ErrorCategory =
  | "not_found"
  | "forbidden"
  | "gone"
  | "connection"
  | "server"
  | "rate_limited"
  | "parse"
  | "other"

export interface ErrorCategoryInfo {
  key: ErrorCategory
  label: string
  priority: number // Lower = more severe, shown first
}

export const ERROR_CATEGORIES: Record<ErrorCategory, ErrorCategoryInfo> = {
  gone: { key: "gone", label: "Gone (Removed)", priority: 1 },
  not_found: { key: "not_found", label: "Not Found", priority: 2 },
  forbidden: { key: "forbidden", label: "Access Denied", priority: 3 },
  connection: { key: "connection", label: "Connection Failed", priority: 4 },
  server: { key: "server", label: "Server Error", priority: 5 },
  rate_limited: { key: "rate_limited", label: "Rate Limited", priority: 6 },
  parse: { key: "parse", label: "Parse Error", priority: 7 },
  other: { key: "other", label: "Other", priority: 8 },
}

// Categorize a feed error message
export function categorizeError(error: string): ErrorCategory {
  const lowerError = error.toLowerCase()

  if (lowerError.includes("gone") || lowerError.includes("410")) {
    return "gone"
  }
  if (lowerError.includes("not found") || lowerError.includes("404")) {
    return "not_found"
  }
  if (lowerError.includes("forbidden") || lowerError.includes("authentication") || lowerError.includes("401") || lowerError.includes("403")) {
    return "forbidden"
  }
  if (lowerError.includes("connection") || lowerError.includes("timeout") || lowerError.includes("timed out")) {
    return "connection"
  }
  if (lowerError.includes("server error") || /5\d\d/.test(error)) {
    return "server"
  }
  if (lowerError.includes("rate limit")) {
    return "rate_limited"
  }
  if (lowerError.includes("parse") || lowerError.includes("parser")) {
    return "parse"
  }
  return "other"
}
