import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useTheme } from "@/contexts/ThemeContext"
import {
  DEFAULT_SYSTEM_THEMES,
  SYSTEM_THEME,
  THEMES,
  getTheme,
  themeBaseClassName,
  type ThemeBase,
  type ThemeDefinition,
  type ThemeSelection,
} from "@/lib/themes"

/**
 * The theme picker.
 *
 * Every option, and every colour in it, comes from the registry in lib/themes.ts
 * and the `[data-theme]` blocks in application.tailwind.css. Nothing here names
 * a palette or a colour, so adding a theme to those two places puts a correct
 * swatch on this screen with no edit to this file.
 *
 * Persistence is not this component's business: `setTheme` applies the palette,
 * refreshes the first-paint cache and PATCHes the account (ThemeContext), which
 * is why this file touches neither localStorage nor the preferences API.
 */

/** Heading over each base's group. Adding a base makes TypeScript ask for one. */
const BASE_GROUP_LABELS: Record<ThemeBase, string> = {
  light: "Light themes",
  dark: "Dark themes",
}

/** Bases in the order the registry first mentions them. */
const BASES: readonly ThemeBase[] = Array.from(new Set(THEMES.map((theme) => theme.base)))

/**
 * One palette, painted in its own colours.
 *
 * The colours are not listed in this file. `data-theme` on the element matches
 * the same `[data-theme="<id>"]` block in application.tailwind.css that <html>
 * matches, so `bg-background`, `bg-foreground` and the rest resolve against that
 * palette's tokens instead of the page's, and a swatch cannot drift from the
 * palette it advertises. The base class goes on too, for the same reason
 * applyTheme puts it on <html>: it is what `dark:` utilities key off.
 */
function ThemeFace({ theme, className }: { theme: ThemeDefinition; className?: string }) {
  return (
    <span
      data-theme={theme.id}
      className={cn(
        "flex h-full flex-col justify-center gap-1 bg-background px-2 py-1.5",
        themeBaseClassName(theme.base),
        className
      )}
    >
      {/* Body text, then muted text, then a muted surface outlined in the
          palette's border colour: background, foreground, muted-foreground,
          muted and border, all at once. */}
      <span className="h-1 w-full rounded-full bg-foreground" />
      <span className="h-1 w-2/3 rounded-full bg-muted-foreground" />
      <span className="h-2.5 w-full rounded-sm border border-border bg-muted" />
    </span>
  )
}

const SWATCH_FRAME = "block h-12 w-full overflow-hidden rounded-md"

function ThemeSwatch({ theme }: { theme: ThemeDefinition }) {
  return (
    <span aria-hidden="true" className={SWATCH_FRAME}>
      <ThemeFace theme={theme} className="border border-border" />
    </span>
  )
}

/**
 * "System" has no palette of its own, so it gets no single swatch. It is drawn
 * as the two palettes it switches between, side by side, which says what it
 * does without claiming to be either one. Showing whichever palette the OS
 * resolves to at this moment would look like a sixth fixed choice.
 */
function SystemSwatch({ pair }: { pair: readonly ThemeDefinition[] }) {
  return (
    <span aria-hidden="true" className={cn(SWATCH_FRAME, "flex border border-border")}>
      {pair.map((entry) => (
        <ThemeFace key={entry.id} theme={entry} className="w-1/2" />
      ))}
    </span>
  )
}

interface ThemeOptionProps {
  value: ThemeSelection
  label: string
  swatch: ReactNode
  describedBy?: string
  checked: boolean
  onSelect: (value: ThemeSelection) => void
}

/**
 * A native radio, sized to cover its card and painted away rather than hidden.
 *
 * `appearance-none` with no background leaves the input invisible but still a
 * real hit target over the whole card, so a pointer, a screen reader and the
 * arrow keys all reach the same control. Its accessible name is the card's
 * visible text; the swatch is aria-hidden and contributes nothing to it.
 */
function ThemeOption({
  value,
  label,
  swatch,
  describedBy,
  checked,
  onSelect,
}: ThemeOptionProps) {
  return (
    <label className="relative block cursor-pointer">
      <input
        type="radio"
        name="theme"
        value={value}
        checked={checked}
        aria-describedby={describedBy}
        onChange={() => onSelect(value)}
        className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none rounded-lg bg-transparent"
      />
      <span
        className={cn(
          "flex flex-col gap-2 rounded-lg border-2 p-2 transition-colors",
          "peer-focus-visible:outline peer-focus-visible:outline-2",
          "peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
          checked ? "border-accent-primary bg-accent" : "border-transparent hover:bg-accent"
        )}
      >
        {swatch}
        <span className="text-center text-xs font-medium leading-tight">{label}</span>
      </span>
    </label>
  )
}

const OPTION_GRID = "grid grid-cols-2 gap-2 sm:grid-cols-3"

export function ThemePicker() {
  const { theme, setTheme } = useTheme()

  // The pair "system" switches between. Read from the registry so the sentence
  // under the option and the two halves of its swatch cannot say different
  // things, or outlive a change to which palettes the pair names.
  const systemPair = [DEFAULT_SYSTEM_THEMES.light, DEFAULT_SYSTEM_THEMES.dark]
    .map((id) => getTheme(id))
    .filter((entry): entry is ThemeDefinition => entry !== undefined)
  const systemNames = systemPair.map((entry) => entry.name)

  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <span id="theme-picker-label" className="text-sm font-medium leading-none">
          Theme
        </span>
        <p className="text-sm text-muted-foreground">
          Applied as soon as you pick one, here and in every other browser you read in
        </p>
      </div>

      <div
        role="radiogroup"
        aria-labelledby="theme-picker-label"
        className="space-y-3"
      >
        <div className="space-y-1">
          <div className={OPTION_GRID}>
            <ThemeOption
              value={SYSTEM_THEME}
              label="System"
              describedBy="theme-system-hint"
              checked={theme === SYSTEM_THEME}
              onSelect={setTheme}
              swatch={<SystemSwatch pair={systemPair} />}
            />
          </div>
          {/* aria-hidden keeps this out of the option's name (which stays
              "System") while aria-describedby still reads it out after it. */}
          <p id="theme-system-hint" aria-hidden="true" className="text-xs text-muted-foreground">
            Switches with your device setting, between {systemNames.join(" and ")}
          </p>
        </div>

        {BASES.map((base) => (
          <div key={base} role="group" aria-labelledby={`theme-group-${base}`}>
            <p
              id={`theme-group-${base}`}
              className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              {BASE_GROUP_LABELS[base]}
            </p>
            <div className={OPTION_GRID}>
              {THEMES.filter((entry) => entry.base === base).map((entry) => (
                <ThemeOption
                  key={entry.id}
                  value={entry.id}
                  label={entry.name}
                  checked={theme === entry.id}
                  onSelect={setTheme}
                  swatch={<ThemeSwatch theme={entry} />}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
