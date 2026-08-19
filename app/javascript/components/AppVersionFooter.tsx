import { appVersion, shortAppVersion } from "@/lib/appVersion"

// Shows which build is running. Renders nothing when the server could not
// determine a SHA, so a development checkout without git history stays quiet
// rather than displaying "unknown".
export function AppVersionFooter() {
  const full = appVersion()
  const short = shortAppVersion()

  if (!full || !short) return null

  return (
    <p className="text-xs text-muted-foreground text-center pt-2 shrink-0">
      NibbleRSS{" "}
      <code title={full} className="font-mono">
        {short}
      </code>
    </p>
  )
}
