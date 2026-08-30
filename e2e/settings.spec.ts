import { test, expect, type Page } from "./fixtures"
import type { FeedsPage, SettingsPage } from "./pages"
// The one import from app source in this suite: the palette guard below has to
// compare the compiled stylesheet against the registry itself, not a copy of it.
import { THEMES } from "@/lib/themes"

/**
 * Settings and preferences E2E tests.
 *
 * Tests the settings dialog and user preferences that affect application behavior.
 */

/**
 * The `--color-*` declarations in the compiled stylesheet, read out of the
 * browser: the `:root` defaults, and one map per `[data-theme]` palette block.
 *
 * A registry entry whose palette block is missing, or which forgets a token,
 * does not throw: the token falls through to the `:root` defaults and the theme
 * renders with a white patch where a surface should be. Nothing in vitest can
 * see that, because vitest never compiles the stylesheet.
 *
 * Values come back resolved to the rgb strings the browser paints, not as the
 * source text: the build minifies colours, so `hsl(0 0% 100%)` reaches the
 * browser as `#fff` in one block and unchanged in another.
 */
async function readPalettes(page: Page): Promise<{
  root: Record<string, string>
  blocks: Record<string, Record<string, string>>
}> {
  return page.evaluate(() => {
    const root: Record<string, string> = {}
    const blocks: Record<string, Record<string, string>> = {}

    const probe = document.createElement("span")
    document.body.appendChild(probe)
    const paint = (value: string) => {
      probe.style.color = ""
      probe.style.color = value
      return getComputedStyle(probe).color
    }

    const visit = (rule: CSSRule) => {
      // Order matters: Chrome's CSSStyleRule also exposes cssRules (for CSS
      // nesting), so a grouping-first check would swallow every style rule.
      if (rule instanceof CSSStyleRule) {
        const tokens = Array.from(rule.style).filter((prop) => prop.startsWith("--color-"))
        const declared = Object.fromEntries(
          tokens.map((token) => [token, paint(rule.style.getPropertyValue(token).trim())])
        )
        if (/(^|,)\s*:root\b/.test(rule.selectorText)) {
          Object.assign(root, declared)
          return
        }
        const named = rule.selectorText.match(/\[data-theme="?([\w-]+)"?\]/)
        if (named) blocks[named[1]] = declared
        return
      }
      // @layer / @media wrappers; Tailwind emits the palettes inside one.
      if ("cssRules" in rule) {
        for (const child of Array.from((rule as CSSGroupingRule).cssRules)) visit(child)
      }
    }

    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules)) visit(rule)
    }
    probe.remove()
    return { root, blocks }
  })
}

test.describe("Opening Settings", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("settings button opens dialog", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await expect(settingsPage.dialog).toBeVisible()
  })

  test("dialog has Settings title", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await expect(settingsPage.title).toBeVisible()
  })

  test("dialog has tabbed interface", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await expect(settingsPage.tabList).toBeVisible()
  })

  test("Escape closes dialog", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await settingsPage.close()

    await expect(settingsPage.dialog).not.toBeVisible()
  })

  test("has Feeds tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await expect(settingsPage.feedsTab).toBeVisible()
  })

  test("has Preferences tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await expect(settingsPage.preferencesTab).toBeVisible()
  })

  test("has Filters tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await expect(settingsPage.filtersTab).toBeVisible()
  })

  test("has Tags tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await expect(settingsPage.tagsTab).toBeVisible()
  })
})

test.describe("Tab Navigation", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("can switch to Feeds tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await settingsPage.goToFeedsTab()

    await expect(settingsPage.feedsTab).toHaveAttribute("data-state", "active")
  })

  test("can switch to Preferences tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await settingsPage.goToPreferencesTab()

    await expect(settingsPage.preferencesTab).toHaveAttribute("data-state", "active")
  })

  test("can switch to Filters tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await settingsPage.goToFiltersTab()

    await expect(settingsPage.filtersTab).toHaveAttribute("data-state", "active")
  })

  test("can switch to Tags tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await settingsPage.goToTagsTab()

    await expect(settingsPage.tagsTab).toHaveAttribute("data-state", "active")
  })

  test("can switch to Import/Export tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await settingsPage.goToImportExportTab()

    await expect(settingsPage.importExportTab).toHaveAttribute("data-state", "active")
  })

  test("Escape closes dialog after switching tabs", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    // Switch through multiple tabs
    await settingsPage.goToFiltersTab()
    await settingsPage.goToPreferencesTab()

    // Escape should close the dialog entirely
    await settingsPage.close()

    await expect(settingsPage.dialog).not.toBeVisible()
  })
})

test.describe("Preferences Tab - Article Display", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("shows Appearance section", async ({ feedsPage, settingsPage, page }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    await expect(page.getByText("Appearance")).toBeVisible()
  })

  test("shows Article Display section", async ({ feedsPage, settingsPage, page }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    await expect(page.getByText("Article Display")).toBeVisible()
  })

  test("shows content preview toggle", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    const toggle = await settingsPage.getContentPreviewToggle()
    await expect(toggle).toBeVisible()
  })

  test("shows strip images toggle", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    const toggle = await settingsPage.getStripImagesToggle()
    await expect(toggle).toBeVisible()
  })
})

test.describe("Preferences Tab - Reading Behavior", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("shows Reading Behavior section", async ({ feedsPage, settingsPage, page }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    await expect(page.getByText("Reading Behavior")).toBeVisible()
  })

  test("shows confirm mark all read toggle", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    const toggle = await settingsPage.getConfirmMarkAllReadToggle()
    await expect(toggle).toBeVisible()
  })

  test("shows articles per page selector", async ({ feedsPage, settingsPage, page }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    // Scope to the settings dialog and match the field label exactly.
    await expect(
      page.getByRole("dialog").getByText("Articles per page", { exact: true })
    ).toBeVisible()
  })
})

test.describe("Preferences Tab - Data Management", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("shows Data Management section", async ({ feedsPage, settingsPage, page }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    await expect(page.getByText("Data Management")).toBeVisible()
  })
})

test.describe("Preferences API", () => {
  test("can get preferences via API", async ({ page }) => {
    const response = await page.request.get("/api/v1/preferences")
    expect(response.ok()).toBe(true)

    const prefs = await response.json()
    expect(prefs).toBeDefined()
  })

  test("can update preferences via API", async ({ page }) => {
    // Get current value first
    const getResponse = await page.request.get("/api/v1/preferences")
    const currentPrefs = await getResponse.json()

    // Toggle a preference
    const newValue =
      currentPrefs.show_content_preview === "true" ? "false" : "true"

    const updateResponse = await page.request.patch("/api/v1/preferences", {
      data: { show_content_preview: newValue },
    })
    expect(updateResponse.ok()).toBe(true)

    // Restore original value
    await page.request.patch("/api/v1/preferences", {
      data: { show_content_preview: currentPrefs.show_content_preview },
    })
  })

  test("preferences include expected keys", async ({ page }) => {
    const response = await page.request.get("/api/v1/preferences")
    const prefs = await response.json()

    // Check for some expected preference keys
    expect(prefs).toHaveProperty("show_content_preview")
    expect(prefs).toHaveProperty("theme")
  })
})

test.describe("Feeds Tab", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("feeds tab shows feed organizer", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()
    await settingsPage.goToFeedsTab()

    // Should show feed organizer content (the tab panel)
    await expect(settingsPage.feedsTab).toHaveAttribute("data-state", "active")
  })

  test("is the default tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    // Feeds tab should be active by default
    await expect(settingsPage.feedsTab).toHaveAttribute("data-state", "active")
  })
})

test.describe("Filters Tab", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("filters tab shows filter content", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()
    await settingsPage.goToFiltersTab()

    // Should show filter management content (tab should be active)
    await expect(settingsPage.filtersTab).toHaveAttribute("data-state", "active")
  })
})

test.describe("Tags Tab", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("tags tab shows tag content", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()
    await settingsPage.goToTagsTab()

    // Should show tag management content (tab should be active)
    await expect(settingsPage.tagsTab).toHaveAttribute("data-state", "active")
  })
})

test.describe("Import/Export Tab", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("import/export tab shows OPML options", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()
    await settingsPage.goToImportExportTab()

    // Should show import/export content (tab should be active)
    await expect(settingsPage.importExportTab).toHaveAttribute("data-state", "active")
  })
})

test.describe("Preference Toggle Interaction", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("clicking toggle changes its state", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    const toggle = await settingsPage.getContentPreviewToggle()
    const initialState = await toggle.isChecked()

    await toggle.click()

    const newState = await toggle.isChecked()
    expect(newState).toBe(!initialState)

    // Toggle back to restore state
    await toggle.click()
  })
})

/** The five colours one theme's swatch paints, as rgb strings. */
interface SwatchColors {
  background: string
  foreground: string
  mutedForeground: string
  muted: string
  border: string
}

/** What the swatch on a theme's card actually paints. */
async function swatchColors(page: Page, id: string): Promise<SwatchColors> {
  return page.evaluate((themeId) => {
    const face = document.querySelector<HTMLElement>(
      `label:has(input[value="${themeId}"]) [data-theme="${themeId}"]`
    )
    if (!face) throw new Error(`no swatch for ${themeId}`)
    const [foreground, mutedForeground, muted] = Array.from(face.children).map(
      (bar) => getComputedStyle(bar)
    )
    return {
      background: getComputedStyle(face).backgroundColor,
      foreground: foreground.backgroundColor,
      mutedForeground: mutedForeground.backgroundColor,
      muted: muted.backgroundColor,
      border: muted.borderTopColor,
    }
  }, id)
}

/** The same five colours, as the page paints them under the applied palette. */
async function appliedColors(page: Page): Promise<SwatchColors> {
  return page.evaluate(() => {
    // The tokens hold hsl() text; a probe turns each into the rgb string
    // getComputedStyle reports for a painted colour, so the two are comparable.
    const probe = document.createElement("span")
    document.body.appendChild(probe)
    const resolve = (token: string) => {
      probe.style.color = getComputedStyle(document.documentElement)
        .getPropertyValue(token)
        .trim()
      return getComputedStyle(probe).color
    }
    const colors = {
      background: getComputedStyle(document.body).backgroundColor,
      foreground: resolve("--color-foreground"),
      mutedForeground: resolve("--color-muted-foreground"),
      muted: resolve("--color-muted"),
      border: resolve("--color-border"),
    }
    probe.remove()
    return colors
  })
}

test.describe("Theme Selection", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("shows theme selector", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    const themeText = await settingsPage.getThemeText()
    await expect(themeText).toBeVisible()
  })

  // Guards the seam between the theme registry (app/javascript/lib/themes.ts,
  // which writes data-theme and the dark class) and the palette blocks in
  // application.tailwind.css that key off them. Vitest never loads the
  // stylesheet, so only a real browser catches the two drifting apart.
  test("selecting a theme applies its palette to the document", async ({
    feedsPage,
    settingsPage,
    page,
  }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    const html = page.locator("html")
    const backgroundColor = () =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor)

    await settingsPage.selectTheme("Dark")
    await expect(html).toHaveAttribute("data-theme", "dark")
    await expect(html).toHaveClass(/(^|\s)dark(\s|$)/)
    // transition-colors means the value arrives a frame or two late; poll.
    await expect.poll(backgroundColor).toBe("rgb(10, 10, 10)")

    await settingsPage.selectTheme("Light")
    await expect(html).toHaveAttribute("data-theme", "light")
    await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/)
    await expect.poll(backgroundColor).toBe("rgb(255, 255, 255)")
  })

  // Every palette, not just the greyscale pair: a registry entry whose CSS
  // block is missing renders as the light theme, which no unit test can see.
  // The bases are asserted from the computed colours rather than the class, so
  // a light palette accidentally marked dark (or the reverse) fails here.
  const PALETTES = [
    { label: "Gruvbox Dark", id: "gruvbox-dark", background: "rgb(43, 40, 38)" },
    { label: "Gruvbox Light", id: "gruvbox-light", background: "rgb(251, 240, 198)" },
    { label: "Sepia", id: "sepia", background: "rgb(244, 236, 215)" },
  ] as const

  for (const palette of PALETTES) {
    test(`${palette.label} paints its own background`, async ({
      feedsPage,
      settingsPage,
      page,
    }) => {
      await feedsPage.openSettings()
      await settingsPage.goToPreferencesTab()
      await settingsPage.selectTheme(palette.label)

      await expect(page.locator("html")).toHaveAttribute("data-theme", palette.id)
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
        .toBe(palette.background)
    })
  }

  test("every registered theme has a palette block defining every token", async ({ page }) => {
    const palettes = await readPalettes(page)

    // Light included: it is the :root fallback, but it also needs a block of
    // its own, because a block is what lets a palette be scoped to something
    // that is not <html> -- which is how the picker's swatches are painted.
    const expected = THEMES.map((theme) => theme.id).sort()
    expect(Object.keys(palettes.blocks).sort()).toEqual(expected)

    // Every palette must declare the same token set. :root carries more than
    // the semantic tokens -- Tailwind emits a variable for each stock colour a
    // utility references, and the accent variables that applyAccentColors owns
    // as inline styles -- so the required set is the palettes' own union, and
    // :root is only checked for containing it.
    const required = Array.from(
      new Set(Object.values(palettes.blocks).flatMap((block) => Object.keys(block)))
    ).sort()
    expect(required).toContain("--color-background")
    expect(required).toContain("--color-muted-foreground")
    expect(required.length).toBeGreaterThanOrEqual(19)
    for (const id of expected) {
      expect(Object.keys(palettes.blocks[id]).sort(), `${id} palette`).toEqual(required)
    }
    for (const token of required) {
      expect(Object.keys(palettes.root), `${token} has no :root fallback`).toContain(token)
    }
  })

  // A swatch that disagrees with the palette it advertises is worse than no
  // swatch, and it is invisible to vitest, which never loads the stylesheet.
  // Both sides are measured here rather than compared against literals: the
  // swatch is read out of the picker, and the palette is read off the page with
  // that theme applied, so nothing in this test knows what any theme looks like.
  test("every swatch paints the palette its card names", async ({
    feedsPage,
    settingsPage,
    page,
  }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    for (const theme of THEMES) {
      const swatch = await swatchColors(page, theme.id)

      await settingsPage.selectTheme(theme.name)
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme.id)
      // transition-colors means a reading taken straight after the swap catches
      // the animation mid-flight; poll until the palette settles.
      await expect.poll(() => appliedColors(page), { message: theme.id }).toEqual(swatch)
    }
  })

  // The swatches are scoped by data-theme rather than painted from a list of
  // colours, so the palette the page happens to be in must not reach into them.
  test("a swatch shows its own palette whatever the page is in", async ({
    feedsPage,
    settingsPage,
    page,
  }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    await settingsPage.selectTheme("Light")
    const fromLight = await swatchColors(page, "gruvbox-dark")

    await settingsPage.selectTheme("Gruvbox Light")
    await expect.poll(() => swatchColors(page, "gruvbox-dark")).toEqual(fromLight)
  })

  // The light values are written twice -- once in @theme, which is what puts
  // them on :root, and once in [data-theme="light"], which is what lets them be
  // scoped to a swatch. Nothing in the stylesheet stops the two copies drifting,
  // so it is checked here.
  test("the light palette block and the :root defaults agree", async ({ page }) => {
    const palettes = await readPalettes(page)

    for (const [token, value] of Object.entries(palettes.blocks.light)) {
      expect(palettes.root[token], `${token} differs from :root`).toBe(value)
    }
  })

  // The reason the warm palettes exist is that the greyscale pair sits near
  // 20:1 and vibrates. Lower contrast is the point, so the floor has to be
  // checked rather than assumed.
  //
  // All five palettes, and the status tokens as well as the text ones
  // (ttrb-x7fn). Light used to be excluded here: --color-muted-foreground sat
  // at 4.35:1 on --color-muted, under AA. The token is now 44% rather than
  // shadcn's 45.1%, which puts it at 4.54, so nothing is exempt any more.
  //
  // The bar is 4.5:1, WCAG AA for normal text, applied to the two status
  // tokens as well: `text-success` and `text-warning` paint 12px text in
  // FeedOrganizer's sync indicator and 14px in OpmlPanel, and 12px is normal
  // text, not large. Clearing 4.5 subsumes the 3:1 non-text minimum for the
  // same tokens used as icon fills.
  //
  // --color-destructive is deliberately absent. It fails on both stock
  // palettes (1.98:1 on Dark, 3.76:1 on Light) because shadcn ships it as a
  // fill colour while this app paints it as text in 29 places; the three
  // hand-authored palettes already pass. Fixing it moves the destructive
  // Button's appearance, so it is ttrb-x7zz rather than part of this guard.
  const CONTRAST_PAIRS = [
    ["--color-foreground", "--color-background"],
    ["--color-muted-foreground", "--color-background"],
    ["--color-muted-foreground", "--color-muted"],
    ["--color-success", "--color-background"],
    ["--color-success", "--color-muted"],
    ["--color-warning", "--color-background"],
    ["--color-warning", "--color-muted"],
  ] as const

  for (const theme of THEMES) {
    test(`${theme.name} keeps body, muted and status text above WCAG AA`, async ({
      feedsPage,
      settingsPage,
      page,
    }) => {
      await feedsPage.openSettings()
      await settingsPage.goToPreferencesTab()
      await settingsPage.selectTheme(theme.name)

      // Reported as one labelled row per pair rather than a single minimum, so
      // a failure names the token that dropped instead of only a number.
      // transition-colors means a measurement taken immediately after the swap
      // catches the animation mid-flight; poll until the values settle.
      await expect
        .poll(
          () =>
            page.evaluate(
              ([pairs, bar]) => {
                // Tailwind emits its own palette in oklch and the theme tokens
                // in hsl, and getComputedStyle hands both back in the notation
                // they were written in. A canvas is what resolves any of them
                // to the sRGB triple the screen actually shows.
                const canvas = document.createElement("canvas")
                canvas.width = canvas.height = 1
                const ctx = canvas.getContext("2d", { willReadFrequently: true })!
                const srgb = (color: string) => {
                  ctx.clearRect(0, 0, 1, 1)
                  ctx.fillStyle = "rgb(255,255,255)"
                  ctx.fillRect(0, 0, 1, 1)
                  ctx.fillStyle = color
                  ctx.fillRect(0, 0, 1, 1)
                  const d = ctx.getImageData(0, 0, 1, 1).data
                  return [d[0], d[1], d[2]] as const
                }
                const channel = (c: number) =>
                  c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
                const luminance = ([r, g, b]: readonly [number, number, number]) =>
                  0.2126 * channel(r / 255) +
                  0.7152 * channel(g / 255) +
                  0.0722 * channel(b / 255)
                const ratio = (
                  a: readonly [number, number, number],
                  b: readonly [number, number, number]
                ) => {
                  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
                  return (hi + 0.05) / (lo + 0.05)
                }

                const styles = getComputedStyle(document.documentElement)
                const resolve = (token: string) =>
                  srgb(styles.getPropertyValue(token).trim())

                return pairs.map(([fg, bg]) => {
                  const value = ratio(resolve(fg), resolve(bg))
                  return `${fg} on ${bg}: ${value >= bar ? "pass" : value.toFixed(2)}`
                })
              },
              [CONTRAST_PAIRS.map(([fg, bg]) => [fg, bg] as const), 4.5] as const
            ),
          { message: theme.id }
        )
        .toEqual(CONTRAST_PAIRS.map(([fg, bg]) => `${fg} on ${bg}: pass`))
    })
  }

  // The TTS and search highlights take both halves of their colour pair from
  // the accent ramp applyAccentColors derives from the reader's hue, so their
  // contrast is a function of that hue and not of the palette. The ramp is
  // fixed-lightness HSL, which holds L across the wheel but not luminance: a
  // yellow --color-accent-primary is roughly six times as bright as a blue one
  // at the same L. Pairing against `primary` therefore held at some hues and
  // collapsed at others -- white on primary measured 1.51:1 at hue 60 before
  // ttrb-x7fn -- so the whole wheel is swept rather than the default hue.
  test("the accent highlights stay above WCAG AA at every hue", async ({
    feedsPage,
    page,
  }) => {
    await feedsPage.waitForBranding()

    const failures = await page.evaluate(() => {
      const canvas = document.createElement("canvas")
      canvas.width = canvas.height = 1
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!
      const srgb = (color: string) => {
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = "rgb(255,255,255)"
        ctx.fillRect(0, 0, 1, 1)
        ctx.fillStyle = color
        ctx.fillRect(0, 0, 1, 1)
        const d = ctx.getImageData(0, 0, 1, 1).data
        return [d[0], d[1], d[2]] as const
      }
      const channel = (c: number) =>
        c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      const luminance = ([r, g, b]: readonly [number, number, number]) =>
        0.2126 * channel(r / 255) + 0.7152 * channel(g / 255) + 0.0722 * channel(b / 255)
      const ratio = (
        a: readonly [number, number, number],
        b: readonly [number, number, number]
      ) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
        return (hi + 0.05) / (lo + 0.05)
      }

      const root = document.documentElement
      const wasDark = root.classList.contains("dark")
      const failures: string[] = []

      // The same derivation as generateAccentColors in lib/accentColors.ts.
      // Written out rather than imported because the highlights read the CSS
      // variables, so the sweep has to set those; importing the function would
      // test the stylesheet against itself only at whatever hue is stored.
      for (let hue = 0; hue < 360; hue += 15) {
        root.style.setProperty("--color-accent-primary", `hsl(${hue}, 70%, 50%)`)
        root.style.setProperty("--color-accent-primary-lighter", `hsl(${hue}, 40%, 92%)`)
        root.style.setProperty("--color-accent-primary-light", `hsl(${hue}, 60%, 70%)`)
        root.style.setProperty("--color-accent-primary-dark", `hsl(${hue}, 75%, 35%)`)
        root.style.setProperty("--color-accent-primary-darker", `hsl(${hue}, 50%, 20%)`)

        for (const dark of [false, true]) {
          root.classList.toggle("dark", dark)
          for (const className of ["tts-word-active", "search-mark"]) {
            const probe = document.createElement("span")
            probe.className = className
            probe.textContent = "x"
            document.body.appendChild(probe)
            const styles = getComputedStyle(probe)
            const value = ratio(srgb(styles.color), srgb(styles.backgroundColor))
            probe.remove()
            if (value < 4.5) {
              failures.push(
                `${dark ? "dark" : "light"} .${className} at hue ${hue}: ${value.toFixed(2)}`
              )
            }
          }
        }
      }

      for (const token of [
        "--color-accent-primary",
        "--color-accent-primary-lighter",
        "--color-accent-primary-light",
        "--color-accent-primary-dark",
        "--color-accent-primary-darker",
      ]) {
        root.style.removeProperty(token)
      }
      root.classList.toggle("dark", wasDark)
      return failures
    })

    expect(failures).toEqual([])
  })

  // The picker used to write the choice to localStorage and nowhere else, so
  // the account never learned about it and the palette did not follow the
  // reader to another browser. The cache is cleared before the reload because
  // it is the only thing that made that version look like it worked within one
  // browser; what is left to carry the choice is the account.
  test("the chosen theme survives a reload on an empty cache", async ({
    feedsPage,
    settingsPage,
    page,
  }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()
    await settingsPage.selectTheme("Dark")
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")

    await page.evaluate(() => localStorage.removeItem("nibbler-theme"))
    await page.reload()
    await feedsPage.waitForBranding()

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/)
    // Refilled from the account, so the next first paint is dark too.
    await expect(page.evaluate(() => localStorage.getItem("nibbler-theme"))).resolves.toBe(
      "dark"
    )
  })

  // The other half of the same claim: a browser that has never seen the picker
  // still opens in the palette the account holds.
  test("a theme stored on the account applies to a browser that has never set one", async ({
    feedsPage,
    page,
  }) => {
    const response = await page.request.patch("/api/v1/preferences", {
      data: { theme: "sepia" },
    })
    expect(response.ok()).toBe(true)

    await page.evaluate(() => localStorage.removeItem("nibbler-theme"))
    await page.reload()
    await feedsPage.waitForBranding()

    await expect(page.locator("html")).toHaveAttribute("data-theme", "sepia")
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toBe("rgb(244, 236, 215)")
  })
})

test.describe("Language Selection", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  // The picker used to change the language in the browser and nowhere else, so
  // the account never learned about it and the control reset itself. The cache
  // is cleared before the reload because it is the only thing that made the
  // broken version look like it worked within one browser; what is left to
  // carry the choice is the account.
  test("the chosen language survives a reload on an empty cache", async ({
    feedsPage,
    settingsPage,
    page,
  }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()
    await settingsPage.selectLanguage("English")
    await expect(settingsPage.getLanguageSelect()).toHaveText("English")

    await page.evaluate(() => localStorage.removeItem("nibbler-language"))
    await page.reload()
    await feedsPage.waitForBranding()
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    await expect(settingsPage.getLanguageSelect()).toHaveText("English")
    await expect(
      page.evaluate(() => localStorage.getItem("nibbler-language"))
    ).resolves.toBe("en")
  })
})

/**
 * The `dark:` utilities against a disagreeing OS preference.
 *
 * Tailwind v4 compiles `dark:` to `@media (prefers-color-scheme: dark)` unless
 * a custom variant says otherwise, which put the handful of `dark:` call sites
 * (NibblerLogo, ui/input, ui/textarea, ui/badge, ui/context-menu,
 * FeedOrganizer) on the OS preference while every `--color-*` token followed
 * the pinned palette. application.tailwind.css now declares
 * `@custom-variant dark (&:where(.dark, .dark *))`.
 *
 * Both directions have to be emulated: with the OS and the palette agreeing,
 * the broken build and the fixed one are indistinguishable. The logo is the
 * probe because `dark:bg-foreground` paints a plate behind it, which is the
 * one difference a reader notices, and because the img needs no interaction to
 * reach.
 */
const NO_DISC = "rgba(0, 0, 0, 0)"

/**
 * The disc colour a dark palette should paint, read off that palette rather
 * than written down here.
 *
 * The utility is `dark:bg-foreground`, not `dark:bg-white` (ttrb-x7fn): the
 * logo art is black linework on transparency and needs a light plate, but a
 * white one is a white disc on a cream page under Gruvbox Dark. Asserting the
 * palette's own `--color-foreground` is what makes this test say "the plate is
 * this palette's light colour" instead of "the plate is white", so a palette
 * added later needs no literal here.
 */
async function paletteForeground(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement("span")
    document.body.appendChild(probe)
    probe.style.color = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-foreground")
      .trim()
    const resolved = getComputedStyle(probe).color
    probe.remove()
    return resolved
  })
}

/**
 * Background painted behind the sidebar logo.
 *
 * Measured with the settings dialog closed. Radix marks the rest of the page
 * aria-hidden while the dialog is open, which takes the img out of the
 * accessibility tree and so out of reach of a role query. `transition-colors`
 * also means the value arrives a frame or two after the swap, so every caller
 * polls this rather than reading it once.
 */
async function logoBackground(page: Page): Promise<string> {
  return page
    .getByRole("img", { name: "Nibbler" })
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor)
}

async function pinTheme(
  feedsPage: FeedsPage,
  settingsPage: SettingsPage,
  label: string
): Promise<void> {
  await feedsPage.openSettings()
  await settingsPage.goToPreferencesTab()
  await settingsPage.selectTheme(label)
  await settingsPage.close()
}

test.describe("dark: utilities on a light-preference OS", () => {
  test.use({ colorScheme: "light" })

  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  // Every dark palette, not just the stock one: the variant keys off the class
  // ThemeContext writes for any registry entry with base "dark", so a palette
  // added later is covered without being named here.
  for (const label of ["Dark", "Gruvbox Dark"] as const) {
    test(`${label} still paints the logo disc`, async ({ feedsPage, settingsPage, page }) => {
      await expect.poll(() => logoBackground(page)).toBe(NO_DISC)

      await pinTheme(feedsPage, settingsPage, label)

      await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/)
      await expect.poll(() => logoBackground(page)).toBe(await paletteForeground(page))
    })
  }
})

test.describe("dark: utilities on a dark-preference OS", () => {
  test.use({ colorScheme: "dark" })

  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("a pinned light palette drops the logo disc", async ({
    feedsPage,
    settingsPage,
    page,
  }) => {
    // "system" resolves through the OS preference, so the disc is there first.
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/)
    await expect.poll(() => logoBackground(page)).toBe(await paletteForeground(page))

    await pinTheme(feedsPage, settingsPage, "Sepia")

    await expect(page.locator("html")).not.toHaveClass(/(^|\s)dark(\s|$)/)
    await expect.poll(() => logoBackground(page)).toBe(NO_DISC)
  })

  // Selecting "system" has to keep tracking the OS: the variant reads the
  // class, and ThemeContext resolves "system" to a concrete palette (and so to
  // the class) from the same media query the variant used to read directly.
  test("system follows the OS preference", async ({ feedsPage, settingsPage, page }) => {
    await pinTheme(feedsPage, settingsPage, "Light")
    await expect.poll(() => logoBackground(page)).toBe(NO_DISC)

    await pinTheme(feedsPage, settingsPage, "System")

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/)
    await expect.poll(() => logoBackground(page)).toBe(await paletteForeground(page))
  })
})

test.describe("Accent Color", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("shows accent color control", async ({ feedsPage, settingsPage, page }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    await expect(page.getByText("Accent color", { exact: true })).toBeVisible()
  })
})
