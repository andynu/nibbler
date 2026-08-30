// Registry of named color themes.
//
// A theme is one full set of the semantic `--color-*` tokens declared in
// app/assets/stylesheets/application.tailwind.css. Every theme, light included,
// declares its tokens in a `[data-theme="<id>"]` block there. The light values
// appear a second time in the `@theme` block, which is what puts them on
// `:root` as the fallback for any token a palette forgets.
//
// Applying a theme writes two things to <html>:
//
//   data-theme="<id>"   selects the palette
//   class="dark"        present for every theme whose base is dark
//
// The class is what long-standing `.dark .foo` selectors match, so a new dark
// palette inherits those rules without touching them. The attribute is what
// selects the palette itself, which keeps "which palette" and "is it dark"
// as two independent facts instead of overloading one class with both.
//
// Adding a theme is a registry entry here plus a `[data-theme="<id>"]` block in
// the stylesheet. Nothing in ThemeContext needs to change.

/** Whether a palette reads as dark-on-light or light-on-dark. */
export type ThemeBase = "light" | "dark"

export interface ThemeDefinition {
  /** Stable id. Persisted verbatim, so renaming one orphans stored values. */
  id: string
  /** Display name for theme pickers. */
  name: string
  base: ThemeBase
}

/** The value stored when the user wants the OS to decide. */
export const SYSTEM_THEME = "system"

/** Attribute on <html> naming the applied palette. */
export const THEME_ATTRIBUTE = "data-theme"

/** Media query that decides what "system" resolves to. */
export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)"

/**
 * Every palette the app ships, in the order theme pickers list them.
 *
 * `light` and `dark` are the near-maximum-contrast greyscale pair. The rest are
 * lower-contrast palettes that carry a warm hue through the surfaces as well as
 * the text, for readers who find white-on-black or black-on-white harsh.
 *
 * Each id needs a matching `[data-theme="<id>"]` block in
 * app/assets/stylesheets/application.tailwind.css. The settings e2e spec reads
 * the compiled stylesheet out of the browser and fails if a registered id has
 * no block, or if a block is missing a token another palette declares.
 */
export const THEMES = [
  { id: "light", name: "Light", base: "light" },
  { id: "dark", name: "Dark", base: "dark" },
  { id: "gruvbox-dark", name: "Gruvbox Dark", base: "dark" },
  { id: "gruvbox-light", name: "Gruvbox Light", base: "light" },
  { id: "sepia", name: "Sepia", base: "light" },
] as const satisfies readonly ThemeDefinition[]

export type ThemeId = (typeof THEMES)[number]["id"]

/** A stored/selected theme: a concrete palette id, or "system". */
export type ThemeSelection = ThemeId | typeof SYSTEM_THEME

/**
 * Which palette "system" resolves to in each direction. Both halves are ids so
 * they can later become user preferences without changing the resolution code.
 */
export interface SystemThemePair {
  light: ThemeId
  dark: ThemeId
}

export const DEFAULT_SYSTEM_THEMES: SystemThemePair = {
  light: "light",
  dark: "dark",
}

/**
 * Classes put on <html> for each base. Empty for light: the light palette is
 * the `:root` default, so it needs no marker.
 */
const BASE_CLASSES: Record<ThemeBase, readonly string[]> = {
  light: [],
  dark: ["dark"],
}

const ALL_BASE_CLASSES = Array.from(
  new Set(Object.values(BASE_CLASSES).flat())
)

/**
 * The classes that mark a base, as a className string.
 *
 * Exported so a preview can scope a palette to a nested element the same way
 * `applyTheme` scopes one to <html>, without restating anywhere else which
 * class means dark.
 */
export function themeBaseClassName(base: ThemeBase): string {
  return (BASE_CLASSES[base] ?? []).join(" ")
}

export function getTheme(id: string | null | undefined): ThemeDefinition | undefined {
  return THEMES.find((theme) => theme.id === id)
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && getTheme(value) !== undefined
}

export function isThemeSelection(value: unknown): value is ThemeSelection {
  return value === SYSTEM_THEME || isThemeId(value)
}

/**
 * Coerce an arbitrary stored value to a usable selection. Ids that no longer
 * exist (a palette removed since the value was written) become "system" rather
 * than leaving the app with no palette at all.
 */
export function normalizeThemeSelection(value: unknown): ThemeSelection {
  return isThemeSelection(value) ? value : SYSTEM_THEME
}

// Where the reader's choice is cached between loads. The `theme` preference the
// server holds is the real answer; this is read synchronously on the way to the
// first paint, which happens before the preferences request comes back, and is
// overwritten from the server as soon as it does.
const THEME_STORAGE_KEY = "nibbler-theme"

/** The cached selection, or undefined when nothing usable is cached. */
export function readStoredTheme(): ThemeSelection | undefined {
  if (typeof window === "undefined") return undefined

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  return isThemeSelection(stored) ? stored : undefined
}

/**
 * Cache a selection for the next first paint.
 *
 * Anything that is not a usable selection clears the cache instead of leaving
 * the previous value behind. A stale value here is not merely unread: the load
 * path adopts a cached theme when the account has none, so leaving one would
 * put the reader back on a theme they had moved away from.
 */
export function storeTheme(selection: unknown): void {
  if (typeof window === "undefined") return

  if (isThemeSelection(selection)) {
    window.localStorage.setItem(THEME_STORAGE_KEY, selection)
  } else {
    window.localStorage.removeItem(THEME_STORAGE_KEY)
  }
}

/** First registered theme with the given base, used as a last-resort fallback. */
function firstThemeWithBase(base: ThemeBase): ThemeDefinition {
  return THEMES.find((theme) => theme.base === base) ?? THEMES[0]
}

/**
 * Resolve a selection to the palette to apply.
 *
 * "system", and any id that is not in the registry, resolve through
 * `systemThemes`; a concrete id resolves to itself.
 */
export function resolveTheme(
  selection: unknown,
  prefersDark: boolean,
  systemThemes: SystemThemePair = DEFAULT_SYSTEM_THEMES
): ThemeDefinition {
  if (selection !== SYSTEM_THEME) {
    const named = getTheme(selection as string)
    if (named) return named
  }

  const base: ThemeBase = prefersDark ? "dark" : "light"
  return (
    getTheme(systemThemes[base]) ??
    getTheme(DEFAULT_SYSTEM_THEMES[base]) ??
    firstThemeWithBase(base)
  )
}

/**
 * Point <html> (or any root element) at a palette. Swaps the base classes
 * rather than toggling one boolean, so switching between two dark palettes
 * leaves the `dark` marker in place and switching to a light one drops it.
 */
export function applyTheme(root: HTMLElement, theme: ThemeDefinition): void {
  const wanted = BASE_CLASSES[theme.base] ?? []

  for (const className of ALL_BASE_CLASSES) {
    root.classList.toggle(className, wanted.includes(className))
  }

  root.setAttribute(THEME_ATTRIBUTE, theme.id)
}
