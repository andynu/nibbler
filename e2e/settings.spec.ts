import { test, expect } from "./fixtures"
// The one import from app source in this suite: the palette guard below has to
// compare the compiled stylesheet against the registry itself, not a copy of it.
import { THEMES } from "@/lib/themes"

/**
 * Settings and preferences E2E tests.
 *
 * Tests the settings dialog and user preferences that affect application behavior.
 */

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

  // A registry entry whose palette block is missing, or which forgets a token,
  // does not throw: the token falls through to the light `@theme` defaults and
  // the theme renders with a white patch where a surface should be. Nothing in
  // vitest can see that, so read the compiled stylesheet out of the browser and
  // compare the two lists directly.
  test("every registered theme has a palette block defining every token", async ({ page }) => {
    const palettes = await page.evaluate(() => {
      const rootTokens = new Set<string>()
      const blocks: Record<string, string[]> = {}

      const visit = (rule: CSSRule) => {
        // Order matters: Chrome's CSSStyleRule also exposes cssRules (for CSS
        // nesting), so a grouping-first check would swallow every style rule.
        if (rule instanceof CSSStyleRule) {
          const tokens = Array.from(rule.style).filter((prop) => prop.startsWith("--color-"))
          if (/(^|,)\s*:root\b/.test(rule.selectorText)) {
            for (const token of tokens) rootTokens.add(token)
            return
          }
          const named = rule.selectorText.match(/\[data-theme="?([\w-]+)"?\]/)
          if (named) blocks[named[1]] = tokens
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
      return { rootTokens: Array.from(rootTokens), blocks }
    })

    // "light" is the :root default every other palette falls back to, so it is
    // the one theme with no [data-theme] block of its own.
    const expected = THEMES.map((theme) => theme.id)
      .filter((id) => id !== "light")
      .sort()
    expect(Object.keys(palettes.blocks).sort()).toEqual(expected)

    // Every palette must declare the same token set. :root carries more than
    // the semantic tokens -- Tailwind emits a variable for each stock colour a
    // utility references, and the accent variables that applyAccentColors owns
    // as inline styles -- so the required set is the palettes' own union, and
    // :root is only checked for containing it.
    const required = Array.from(new Set(Object.values(palettes.blocks).flat())).sort()
    expect(required).toContain("--color-background")
    expect(required).toContain("--color-muted-foreground")
    expect(required.length).toBeGreaterThanOrEqual(19)
    for (const id of expected) {
      expect(palettes.blocks[id].sort(), `${id} palette`).toEqual(required)
    }
    for (const token of required) {
      expect(palettes.rootTokens, `${token} has no :root fallback`).toContain(token)
    }
  })

  // The reason these palettes exist is that the greyscale pair sits near 20:1
  // and vibrates. Lower contrast is the point, so the floor has to be checked
  // rather than assumed: body text and the muted foreground both stay above
  // WCAG AA at normal size.
  //
  // Only the low-contrast palettes are asserted. The stock Light theme already
  // sits at 4.35 for muted-foreground on muted and would fail this bar; that
  // predates the named themes and belongs to the colour audit (ttrb-x7fn), not
  // here. Dark passes at 6.0.
  test("the low-contrast palettes keep body and muted text above WCAG AA", async ({
    feedsPage,
    settingsPage,
    page,
  }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    for (const { label } of PALETTES) {
      await settingsPage.selectTheme(label)
      // transition-colors means a measurement taken immediately after the swap
      // catches the animation mid-flight; wait for the value to settle.
      await expect
        .poll(() =>
          page.evaluate(() => {
            const styles = getComputedStyle(document.body)
            const channel = (c: number) =>
              c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
            const luminance = (color: string) => {
              const [r, g, b] = color.match(/[\d.]+/g)!.map((v) => Number(v) / 255)
              return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
            }
            const ratio = (a: string, b: string) => {
              const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
              return (hi + 0.05) / (lo + 0.05)
            }

            const read = (token: string) =>
              getComputedStyle(document.documentElement).getPropertyValue(token).trim()
            const probe = document.createElement("span")
            document.body.appendChild(probe)
            const resolve = (token: string) => {
              probe.style.color = read(token)
              return getComputedStyle(probe).color
            }
            const background = styles.backgroundColor
            const muted = resolve("--color-muted")
            const mutedForeground = resolve("--color-muted-foreground")
            probe.remove()

            return Math.min(
              ratio(styles.color, background),
              ratio(mutedForeground, background),
              ratio(mutedForeground, muted)
            )
          })
        )
        .toBeGreaterThanOrEqual(4.5)
    }
  })

  test("the chosen theme survives a reload", async ({ feedsPage, settingsPage, page }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()
    await settingsPage.selectTheme("Dark")
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")

    await page.reload()
    await feedsPage.waitForBranding()

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/)
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
