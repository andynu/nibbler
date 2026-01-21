// Rainbow palette with good contrast for tag display
// Each color has a background and foreground color for accessibility

interface TagColor {
  bg: string
  fg: string
}

const RAINBOW_PALETTE: TagColor[] = [
  { bg: "#ef4444", fg: "#ffffff" }, // Red
  { bg: "#f97316", fg: "#ffffff" }, // Orange
  { bg: "#eab308", fg: "#000000" }, // Yellow
  { bg: "#22c55e", fg: "#ffffff" }, // Green
  { bg: "#14b8a6", fg: "#ffffff" }, // Teal
  { bg: "#3b82f6", fg: "#ffffff" }, // Blue
  { bg: "#8b5cf6", fg: "#ffffff" }, // Purple
  { bg: "#ec4899", fg: "#ffffff" }, // Pink
]

/**
 * Get a stable color for a tag name using a hash function.
 * The same tag name will always get the same color.
 */
export function getTagColor(tagName: string): TagColor {
  let hash = 0
  for (let i = 0; i < tagName.length; i++) {
    hash = ((hash << 5) - hash) + tagName.charCodeAt(i)
    hash = hash & hash // Convert to 32-bit integer
  }
  const index = Math.abs(hash) % RAINBOW_PALETTE.length
  return RAINBOW_PALETTE[index]
}

/**
 * Get a lighter version of the tag color for backgrounds (20% opacity)
 */
export function getTagColorLight(tagName: string): { bg: string; text: string } {
  const color = getTagColor(tagName)
  return {
    bg: `${color.bg}33`, // 20% opacity
    text: color.bg,
  }
}
