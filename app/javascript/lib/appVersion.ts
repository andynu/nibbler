// Reads the build identifier the Rails layout stamps into <head>.
//
// The meta tag is always present; its content is the literal "unknown" when the
// server could not determine a SHA. Callers get null in that case so they can
// omit the display entirely rather than showing "unknown" to a reader.

const UNKNOWN = "unknown"
const SHORT_LENGTH = 7

export function appVersion(): string | null {
  const content = document
    .querySelector('meta[name="app-version"]')
    ?.getAttribute("content")
    ?.trim()

  if (!content || content === UNKNOWN) return null
  return content
}

export function shortAppVersion(): string | null {
  return appVersion()?.slice(0, SHORT_LENGTH) ?? null
}
