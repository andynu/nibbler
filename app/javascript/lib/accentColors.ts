// Generates accent colors from a single hue value (0-360)
// Uses HSL color space for predictable color derivation

interface AccentColors {
  primary: string
  primaryLight: string
  primaryDark: string
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
  const primaryLight = `hsl(${h}, 60%, 70%)`
  const primaryDark = `hsl(${h}, 75%, 35%)`

  // Secondary colors - complement (opposite on color wheel)
  const secondaryHue = (h + 180) % 360
  const secondary = `hsl(${secondaryHue}, 70%, 50%)`
  const secondaryLight = `hsl(${secondaryHue}, 60%, 70%)`
  const secondaryDark = `hsl(${secondaryHue}, 75%, 35%)`

  return {
    primary,
    primaryLight,
    primaryDark,
    secondary,
    secondaryLight,
    secondaryDark,
  }
}

/**
 * Apply accent colors to the document as CSS custom properties
 * @param hue - The primary hue (0-360)
 */
export function applyAccentColors(hue: number): void {
  const colors = generateAccentColors(hue)
  const root = document.documentElement

  root.style.setProperty("--color-accent-primary", colors.primary)
  root.style.setProperty("--color-accent-primary-light", colors.primaryLight)
  root.style.setProperty("--color-accent-primary-dark", colors.primaryDark)
  root.style.setProperty("--color-accent-secondary", colors.secondary)
  root.style.setProperty("--color-accent-secondary-light", colors.secondaryLight)
  root.style.setProperty("--color-accent-secondary-dark", colors.secondaryDark)
}

/**
 * Default accent hue (blue)
 */
export const DEFAULT_ACCENT_HUE = 210
