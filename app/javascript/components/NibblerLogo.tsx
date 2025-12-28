import { cn } from "@/lib/utils"

interface NibblerLogoProps {
  size?: number
  className?: string
}

export function NibblerLogo({ size = 24, className }: NibblerLogoProps) {
  return (
    <img
      src="/nibbler-logo.png"
      alt="Nibbler"
      width={size}
      height={size}
      className={cn("rounded-full dark:bg-white dark:p-0.5", className)}
    />
  )
}
