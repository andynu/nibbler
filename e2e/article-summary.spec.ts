import { test, expect, type Page } from "./fixtures"
import { THEMES } from "@/lib/themes"

/**
 * The article summary control and the segment it opens.
 *
 * Why this file exists rather than more component tests: happy-dom loads no
 * stylesheet, so every element there answers getByRole at every viewport width
 * and nothing in Vitest can say whether the control is actually on screen, or
 * whether the panel is legible on a given palette. Both of those need a real
 * engine with the real application.css.
 *
 * Nothing here generates anything. E2eDataset seeds one article that already
 * carries a summary (E2eDataset::SUMMARIZED_HEADLINE), which exercises the
 * cached-on-open path with no job, no websocket and no model; the seeded
 * articles are all a few hundred characters, well under
 * EntrySummarizer::MIN_CONTENT_CHARS, so every other one exercises the
 * excerpt-only refusal. The wait states are driven by a broadcast and are
 * covered in EntryContent.test.tsx instead.
 */

const SUMMARIZED_HEADLINE = "Rust 1.90 stabilises const generics"
const EXCERPT_HEADLINE = "A tour of the borrow checker"
const SUMMARY_OPENING = "The release promotes const generics to stable"
const SUMMARY_MODEL = "gemma4:e4b"

async function openArticle(page: Page, headline: string) {
  await page.goto("/")
  await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })

  const row = page
    .getByRole("listbox", { name: "Entries" })
    .getByRole("option", { name: new RegExp(headline, "i") })

  await expect(row.first()).toBeVisible({ timeout: 10000 })
  await row.first().click()
  await expect(page.getByTestId("entry-header")).toBeVisible()
}

const callout = (page: Page) => page.getByTestId("entry-summary-callout")

test.describe("Article summary", () => {
  test("a summarized article opens with its paragraph, asking for nothing", async ({ page }) => {
    // The summary comes down inside GET /api/v1/entries/:id, so opening a
    // summarized article must cost no extra request and no model time.
    const summarizeCalls: string[] = []
    page.on("request", (request) => {
      if (request.url().includes("/summarize")) summarizeCalls.push(request.url())
    })

    await openArticle(page, SUMMARIZED_HEADLINE)

    await expect(callout(page)).toBeVisible()
    await expect(page.getByTestId("entry-summary-text")).toContainText(SUMMARY_OPENING)
    await expect(page.getByTestId("entry-summary-provenance")).toContainText(SUMMARY_MODEL)
    expect(summarizeCalls).toEqual([])
  })

  test("the segment can be put away and brought back", async ({ page }) => {
    await openArticle(page, SUMMARIZED_HEADLINE)
    await expect(callout(page)).toBeVisible()

    await page.getByRole("button", { name: "Dismiss summary" }).click()
    await expect(callout(page)).toHaveCount(0)

    await page.getByRole("button", { name: "Show summary" }).click()
    await expect(page.getByTestId("entry-summary-text")).toContainText(SUMMARY_OPENING)
  })

  // Below EntrySummarizer::MIN_CONTENT_CHARS the server refuses, so the reading
  // pane says why rather than offering a control that cannot work (ttrb-ewz4).
  test("an excerpt-only article says so instead of offering the control", async ({ page }) => {
    await openArticle(page, EXCERPT_HEADLINE)

    await expect(page.getByText(/this feed publishes an excerpt only/i)).toBeVisible()
    await expect(page.getByRole("button", { name: "Summarize this article" })).toHaveCount(0)
    await expect(callout(page)).toHaveCount(0)
  })

  /**
   * 375 is an iPhone SE/12 mini in portrait, under both the custom xs
   * breakpoint (30rem) and Tailwind's sm (40rem) that between them strip four
   * controls out of the article header. The summary control lives in the
   * article's own action row rather than that header, so it sheds at no width
   * and needs no place in the overflow menu; this is what says so.
   */
  test.describe("on a phone", () => {
    test.use({ viewport: { width: 375, height: 720 } })

    test("the control and the segment are both on screen", async ({ page }) => {
      await openArticle(page, SUMMARIZED_HEADLINE)

      await expect(callout(page)).toBeVisible()
      await expect(page.getByTestId("entry-summary-text")).toBeVisible()

      const toggle = page.getByRole("button", { name: "Hide summary" })
      await expect(toggle).toBeVisible()
      await toggle.click()
      await expect(callout(page)).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Show summary" })).toBeVisible()
    })

    test("an excerpt-only article's explanation is on screen too", async ({ page }) => {
      await openArticle(page, EXCERPT_HEADLINE)

      await expect(page.getByText(/this feed publishes an excerpt only/i)).toBeVisible()
    })
  })

  /**
   * The panel paints itself with --color-muted, so its text lands on the one
   * surface e2e/settings.spec.ts already measures every palette's status and
   * muted tokens against. That is the argument; this measures the rendered
   * elements to check the argument survived contact with the markup.
   *
   * Both text weights are checked: the paragraph is --color-foreground at 14px
   * and the provenance line --color-muted-foreground at 12px, which is normal
   * text by WCAG's reckoning and so takes the same 4.5:1 bar.
   */
  for (const theme of THEMES) {
    test(`${theme.name} keeps the summary panel above WCAG AA`, async ({
      page,
      feedsPage,
      settingsPage,
    }) => {
      // Article first, then the palette, so the measurement never depends on a
      // theme surviving a reload -- that is settings.spec.ts's question.
      await openArticle(page, SUMMARIZED_HEADLINE)
      await expect(callout(page)).toBeVisible()

      await feedsPage.openSettings()
      await settingsPage.goToPreferencesTab()
      await settingsPage.selectTheme(theme.name)
      await settingsPage.close()

      await expect(callout(page)).toBeVisible()

      // transition-colors means a measurement taken straight after a repaint
      // can catch the animation mid-flight; poll until the values settle.
      await expect
        .poll(
          () =>
            page.evaluate((bar) => {
              // A canvas is what resolves whatever notation a colour was
              // written in, and what composites a translucent fill over what
              // is behind it, into the sRGB triple the screen shows.
              const canvas = document.createElement("canvas")
              canvas.width = canvas.height = 1
              const ctx = canvas.getContext("2d", { willReadFrequently: true })!
              const srgb = (...layers: string[]) => {
                ctx.clearRect(0, 0, 1, 1)
                for (const layer of layers) {
                  ctx.fillStyle = layer
                  ctx.fillRect(0, 0, 1, 1)
                }
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

              const panel = document.querySelector<HTMLElement>(
                '[data-testid="entry-summary-callout"]'
              )!
              const behind = getComputedStyle(document.body).backgroundColor
              const surface = srgb(behind, getComputedStyle(panel).backgroundColor)

              return (
                [
                  ["paragraph", "entry-summary-text"],
                  ["provenance", "entry-summary-provenance"],
                ] as const
              ).map(([label, id]) => {
                const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!
                const value = ratio(srgb(getComputedStyle(el).color), surface)
                return `${label}: ${value >= bar ? "pass" : value.toFixed(2)}`
              })
            }, 4.5),
          { message: theme.id }
        )
        .toEqual(["paragraph: pass", "provenance: pass"])
    })
  }
})
