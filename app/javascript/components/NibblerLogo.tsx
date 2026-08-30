import { cn } from "@/lib/utils"

interface NibblerLogoProps {
  size?: number
  className?: string
}

// The logo art is black linework on transparency, so a dark theme needs a light
// plate behind it. That plate is `foreground` rather than white: it is whatever
// light colour the palette itself uses, which is near-white on Dark and cream on
// Gruvbox Dark, instead of a white disc on a warm page.
export function NibblerLogo({ size = 24, className }: NibblerLogoProps) {
  return (
    <img
      src="/nibbler-logo.png"
      alt="Nibbler"
      width={size}
      height={size}
      className={cn("rounded-full dark:bg-foreground dark:p-0.5", className)}
    />
  )
}
