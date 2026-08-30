/// <reference types="vite/client" />
import { describe, it, expect } from "vitest"

/**
 * Source guard: no component paints a colour that only works on one palette.
 *
 * This is the static half of the pair the theme colour audit (ttrb-x7fn) left
 * behind. The other half lives in e2e/settings.spec.ts and measures the
 * `--color-*` tokens in a real browser at real contrast ratios. Neither
 * subsumes the other: the browser test can only see colours that reach it
 * through a token, so a component that writes `text-green-500` is invisible to
 * it -- the token set stays perfectly legible while the component does not use
 * it. This test is what notices the literal.
 *
 * The failure it exists to prevent: the app shipped 23 hardcoded Tailwind
 * palette utilities, and two of them (`bg-yellow-50`, `bg-green-50` in
 * OpmlPanel) rendered a near-white card on every dark palette, measured at
 * 19.14:1 against the stock Dark background. Nothing caught it because nothing
 * was looking.
 *
 * The fix for a failure here is almost always `text-success`, `text-warning` or
 * `text-destructive-text`, plus the matching `bg-destructive` and
 * `border-destructive` opacity tints, which every palette defines. If a literal
 * is genuinely right, add the file to
 * DOCUMENTED_EXCEPTIONS with the reason -- the audit's acceptance criterion is
 * "no colour that is not derived from a theme token, other than deliberately
 * documented exceptions", so an exception is a decision, not a workaround.
 */

/**
 * Every app source file, path to text.
 *
 * Read through Vite's glob import rather than node:fs so the test needs no
 * @types/node and no tsconfig change, and so the paths it reports are the
 * stable `components/Foo.tsx` form regardless of where the suite is run from.
 */
const SOURCE_PREFIX = "/app/javascript/"

const SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(
    // Root-anchored, so the keys are the same whichever file holds the glob.
    // A relative pattern comes back mixing `./foo.ts` for siblings with
    // `../components/Foo.tsx` for the rest, which is not a usable path.
    import.meta.glob("/app/javascript/**/*.{ts,tsx}", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>
  )
    .map(([path, source]) => [path.replace(SOURCE_PREFIX, ""), source] as const)
    .filter(([path]) => !/\.test\.tsx?$/.test(path))
)

const SOURCE_PATHS = Object.keys(SOURCES).sort()

/** Tailwind's stock palette. A theme token would be named, not numbered. */
const PALETTE_HUES = [
  "slate", "gray", "zinc", "neutral", "stone",
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal",
  "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
]

const UTILITY_PREFIXES = [
  "text", "bg", "border", "ring", "fill", "stroke", "from", "via", "to",
  "decoration", "outline", "shadow", "accent", "caret", "divide", "placeholder",
]

/** e.g. `text-green-600`, `dark:bg-yellow-50`, `hover:border-red-200/50`. */
const PALETTE_UTILITY = new RegExp(
  `\\b(?:${UTILITY_PREFIXES.join("|")})-(?:${PALETTE_HUES.join("|")})-(?:50|100|200|300|400|500|600|700|800|900|950)\\b`,
  "g"
)

/** `#rgb`, `#rrggbb`, `#rrggbbaa`, and functional rgb()/hsl() colours. */
const COLOR_LITERAL = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{1,5})?\b|\b(?:rgba?|hsla?)\s*\(/g

/**
 * `text-white`, `dark:bg-black/50`, and friends.
 *
 * Separate from PALETTE_UTILITY because the two fail differently. A numbered
 * palette utility is nearly always an oversight; white and black are sometimes
 * exactly right (a scrim dims the page on any base) and sometimes the whole
 * bug -- NibblerLogo's `dark:bg-white` painted a white disc on Gruvbox Dark's
 * cream page, and ui/badge's `text-white` measured 3.19:1 on the light red
 * that palette uses for --color-destructive.
 */
const ACHROMATIC_UTILITY = new RegExp(
  `\\b(?:${UTILITY_PREFIXES.join("|")})-(?:white|black)\\b`,
  "g"
)

/**
 * `text-destructive`, `hover:text-destructive`, and friends -- the fill token
 * painted as a foreground.
 *
 * --color-destructive is shadcn's *fill*: a solid a destructive Button sits on
 * with --color-destructive-foreground written over it. The app also painted it
 * as text in 27 places, which is a different measurement entirely, and one it
 * failed. Stock Dark's hsl(0 62.8% 30.6%) is a dark red designed to carry white
 * text at 9.60:1; as text on that palette's near-black page it measures 1.98:1,
 * effectively invisible. Light measured 3.76:1, under AA. See ttrb-x7zz.
 *
 * Foreground uses take --color-destructive-text, which every palette defines at
 * or above 4.5:1 against both --color-background and --color-muted. This
 * pattern is what stops the fill token drifting back into a className.
 *
 * The trailing (?!-) is what keeps `text-destructive-foreground` (the fill's
 * own foreground) and `text-destructive-text` out of the match.
 */
const DESTRUCTIVE_AS_TEXT = /\btext-destructive\b(?!-)/g

type PatternName =
  | "palette utility"
  | "colour literal"
  | "white or black"
  | "fill token as text"

/**
 * Files allowed to carry literal colours, which pattern each is excused from,
 * and why.
 *
 * The common thread in the first three: each paints a fill and its own
 * foreground together, so the pair's legibility is a property of the pair and
 * never of the page behind it. Such a colour is theme-independent by
 * construction, which is exactly what the status utilities were not.
 *
 * The exemption is per pattern, not per file, so excusing a component's scrim
 * does not also excuse a `text-green-600` someone adds to it later.
 */
const DOCUMENTED_EXCEPTIONS: { file: string; pattern: PatternName; reason: string }[] = [
  {
    file: "lib/tag-colors.ts",
    pattern: "colour literal",
    reason:
      "Tag chips carry their own bg/fg pair and the values are stored per tag " +
      "in the database, so they outlive any palette the reader picks.",
  },
  {
    file: "components/LabelManager.tsx",
    pattern: "colour literal",
    reason:
      "The swatch picker offering lib/tag-colors.ts's palette, plus the stored " +
      "fg_color/bg_color defaults for a tag.",
  },
  {
    file: "components/ScoreButtons.tsx",
    pattern: "colour literal",
    reason:
      "Five colours encoding an ordinal scale; they must keep their order and " +
      "their distinctness from each other on every palette.",
  },
  {
    file: "components/PreferencesPanel.tsx",
    pattern: "colour literal",
    reason:
      "The accent hue slider's track is the hue wheel it selects from, at the " +
      "saturation and lightness generateAccentColors will use.",
  },
  {
    file: "lib/accentColors.ts",
    pattern: "colour literal",
    reason:
      "Derives the accent ramp from the reader's chosen hue; the hsl() calls " +
      "are the derivation itself.",
  },
  {
    file: "components/ui/dialog.tsx",
    pattern: "white or black",
    reason:
      "A modal scrim dims whatever is behind it, so black at low alpha is " +
      "correct on a light page and a dark one alike; a themed scrim would " +
      "lighten the page it is meant to recede.",
  },
  {
    file: "components/mobile/SidebarDrawer.tsx",
    pattern: "white or black",
    reason:
      "The drawer's scrim, same reasoning as components/ui/dialog.tsx.",
  },
  {
    file: "components/ui/context-menu.tsx",
    pattern: "fill token as text",
    reason:
      "ContextMenuItem's destructive variant was ruled out of ttrb-x7zz's " +
      "scope so its appearance would not move; it still paints the fill token " +
      "as text and still measures 1.98:1 on Dark. Tracked as ttrb-dm5p.",
  },
]

/** Strip comments so a token name quoted in prose is not read as a use. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

function scan(pattern: RegExp, name: PatternName): { file: string; hits: string[] }[] {
  const excused = new Set(
    DOCUMENTED_EXCEPTIONS.filter((exception) => exception.pattern === name).map(
      (exception) => exception.file
    )
  )

  return SOURCE_PATHS.map((file) => {
    if (excused.has(file)) return { file, hits: [] }
    const hits = withoutComments(SOURCES[file]).match(pattern) ?? []
    return { file, hits: Array.from(new Set(hits)).sort() }
  }).filter((result) => result.hits.length > 0)
}

describe("theme-safe colours", () => {
  it("paints no Tailwind palette utility outside the documented exceptions", () => {
    expect(scan(PALETTE_UTILITY, "palette utility")).toEqual([])
  })

  it("paints no literal hex or rgb()/hsl() colour outside the documented exceptions", () => {
    expect(scan(COLOR_LITERAL, "colour literal")).toEqual([])
  })

  it("paints no literal white or black outside the documented exceptions", () => {
    expect(scan(ACHROMATIC_UTILITY, "white or black")).toEqual([])
  })

  it("paints the destructive fill token as text nowhere outside the documented exceptions", () => {
    expect(scan(DESTRUCTIVE_AS_TEXT, "fill token as text")).toEqual([])
  })

  // An exception is only a decision while its reason is written down, and only
  // useful while it still excuses something. A stale entry is worse than none:
  // it silently exempts a file from the guard for a reason that has expired.
  it("keeps every exception documented, live, and still needed", () => {
    const patterns: Record<PatternName, RegExp> = {
      "palette utility": PALETTE_UTILITY,
      "colour literal": COLOR_LITERAL,
      "white or black": ACHROMATIC_UTILITY,
      "fill token as text": DESTRUCTIVE_AS_TEXT,
    }

    for (const { file, pattern, reason } of DOCUMENTED_EXCEPTIONS) {
      expect(
        SOURCE_PATHS,
        `${file} is listed as an exception but no longer exists`
      ).toContain(file)
      expect(reason.length, `${file} has no reason`).toBeGreaterThan(40)

      expect(
        withoutComments(SOURCES[file]).match(patterns[pattern]),
        `${file} no longer carries a ${pattern}; drop its exception`
      ).not.toBeNull()
    }
  })
})
