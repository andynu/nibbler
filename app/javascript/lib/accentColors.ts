// Generates accent colors from a single hue value (0-360)
// Uses HSL color space for predictable color derivation

interface AccentColors {
  primary: string
  primaryLighter: string
  primaryLight: string
  primaryDark: string
  primaryDarker: string
  secondary: string
  secondaryLight: string
  secondaryDark: string
}

/**
 * Generate a full accent color palette from a single hue value
 * @param hue - The primary hue (0-360)
 * @returns Object with all accent color variations as HSL strings
 */
export function generateAccentColors(hue: number): AccentColors {
  // Normalize hue to 0-360
  const h = ((hue % 360) + 360) % 360

  // Primary colors - using the selected hue
  const primary = `hsl(${h}, 70%, 50%)`
  const primaryLighter = `hsl(${h}, 40%, 92%)` // Very subtle, for light mode parent highlights
  const primaryLight = `hsl(${h}, 60%, 70%)`
  const primaryDark = `hsl(${h}, 75%, 35%)`
  const primaryDarker = `hsl(${h}, 50%, 20%)` // Very subtle, for dark mode parent highlights

  // Secondary colors - complement (opposite on color wheel)
  const secondaryHue = (h + 180) % 360
  const secondary = `hsl(${secondaryHue}, 70%, 50%)`
  const secondaryLight = `hsl(${secondaryHue}, 60%, 70%)`
  const secondaryDark = `hsl(${secondaryHue}, 75%, 35%)`

  return {
    primary,
    primaryLighter,
    primaryLight,
    primaryDark,
    primaryDarker,
    secondary,
    secondaryLight,
    secondaryDark,
  }
}

/**
 * Apply accent colors to the document as CSS custom properties
 *
 * These land as INLINE styles on <html>, which beats every class- and
 * attribute-based rule in the stylesheet. A named theme therefore cannot ship
 * its own accent colours by declaring `--color-accent-primary` in its
 * `[data-theme="..."]` block: the stored hue always wins, on every theme.
 *
 * That is deliberate. The accent hue is a separate user preference from the
 * palette, and the themes in lib/themes.ts define only the neutral surface and
 * text tokens, so the two controls stay independent and the accent slider keeps
 * meaning what it says. Giving a theme a default hue would mean applying it
 * through this function when the theme is selected (and deciding whether that
 * overwrites the stored preference), not through CSS.
 *
 * @param hue - The primary hue (0-360)
 */
export function applyAccentColors(hue: number): void {
  const colors = generateAccentColors(hue)
  const root = document.documentElement

  root.style.setProperty("--color-accent-primary", colors.primary)
  root.style.setProperty("--color-accent-primary-lighter", colors.primaryLighter)
  root.style.setProperty("--color-accent-primary-light", colors.primaryLight)
  root.style.setProperty("--color-accent-primary-dark", colors.primaryDark)
  root.style.setProperty("--color-accent-primary-darker", colors.primaryDarker)
  root.style.setProperty("--color-accent-secondary", colors.secondary)
  root.style.setProperty("--color-accent-secondary-light", colors.secondaryLight)
  root.style.setProperty("--color-accent-secondary-dark", colors.secondaryDark)
}

/**
 * Default accent hue (blue)
 */
export const DEFAULT_ACCENT_HUE = 210
