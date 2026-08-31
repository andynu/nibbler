import { test, expect, type Page } from "./fixtures"

/**
 * The article actions a phone can reach (ttrb-tyvd).
 *
 * The reason this file exists rather than a class assertion in a component
 * test: happy-dom loads no stylesheet, so `hidden xs:inline-flex` is inert
 * there and every header button answers getByRole at every width. A component
 * test can prove the overflow menu is wired; only a real engine with the real
 * application.css can prove the header actually sheds those buttons and that
 * the menu is therefore the only way to them. Asserting on the class strings
 * instead would prove neither - a class name says nothing about whether a
 * control is reachable.
 *
 * These run in both configured engines. Nothing here needs `isMobile` or
 * trusted touch injection, which Firefox does not support; a viewport override
 * plus ordinary clicks is enough, and the CSS under test is width-driven.
 *
 * 375 is an iPhone SE/12 mini in portrait, 414 a Pro Max. Both are under the
 * custom xs breakpoint (30rem/480px) that hides the note, framing and follow
 * buttons and under Tailwind's sm (40rem/640px) that hides the score control.
 */
const PHONE_WIDTHS = [375, 414] as const

/**
 * Three of the four the header sheds, by the accessible name the header gives
 * them. The score control is the fourth and is checked separately: it is a
 * group of buttons rather than one, and hidden through its wrapper.
 */
const SHED_HEADER_BUTTONS = [
  /add note|edit note/i,
  /show original page|show rss content/i,
  /follow this story/i,
]

async function openFirstEntry(page: Page) {
  const rows = page.getByRole("listbox", { name: "Entries" }).getByRole("option")
  await expect(rows.first()).toBeVisible()

  await rows.first().click()
  await expect(page.getByTestId("entry-header")).toBeVisible()
}

const overflowTrigger = (page: Page) =>
  page.getByRole("button", { name: "More article actions" })

/**
 * The leading wait is not decoration. A Radix menu is modal: while one is open
 * it aria-hides the rest of the document, so getByRole cannot see the trigger,
 * and it stays mounted through its own closing animation, so a second open
 * started too early would find two role="menu" nodes and trip strict mode.
 * Waiting for the previous one to unmount makes both lookups unambiguous
 * whatever the animation timing does.
 */
async function openOverflowMenu(page: Page) {
  await expect(page.getByRole("menu")).toHaveCount(0)
  await expect(overflowTrigger(page)).toBeVisible()
  await overflowTrigger(page).click()
  await expect(page.getByRole("menu")).toBeVisible()
}

for (const width of PHONE_WIDTHS) {
  test.describe(`Article actions at ${width}px`, () => {
    test.use({ viewport: { width, height: 720 } })

    test.beforeEach(async ({ page }) => {
      await page.goto("/")
      await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
      await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
      await openFirstEntry(page)
    })

    // The premise. If this stops holding - someone widens the breakpoints, or
    // drops the `hidden` classes - the rest of this file is testing a menu
    // nobody needs, and that is worth being told about.
    test("the header really has shed these buttons", async ({ page }) => {
      const header = page.getByTestId("entry-header")

      // Positive control. getByRole leaves out anything display:none hides from
      // the accessibility tree, so the assertions below would pass just as
      // happily against a header that had not rendered, or a query that never
      // matched anything. A control that is meant to survive this width proves
      // the queries reach the header at all.
      await expect(header.getByRole("button", { name: /add star|remove star/i })).toBeVisible()

      for (const name of SHED_HEADER_BUTTONS) {
        await expect(header.getByRole("button", { name })).toBeHidden()
      }
      // The score control is display:none through its wrapper rather than
      // unmounted, so its buttons are still in the DOM. ScoreButtons draws five
      // "Set score to n" while the entry is unscored and one "Score: n. Click
      // to change." once it is; either shape is hidden here.
      await expect(
        header.getByRole("button", { name: /set score to|score: \d/i }).first()
      ).toBeHidden()
    })

    test("every shed action is reachable through the overflow menu", async ({
      page,
    }) => {
      await openOverflowMenu(page)

      await expect(page.getByRole("menuitem", { name: /add note|edit note/i })).toBeVisible()
      await expect(page.getByRole("menuitem", { name: "Show original page" })).toBeVisible()
      await expect(page.getByRole("menuitem", { name: "Follow this story" })).toBeVisible()
      await expect(page.getByRole("menuitemradio", { name: "Score 3" })).toBeVisible()
    })
  })
}

test.describe("Article actions on a 375px phone", () => {
  test.use({ viewport: { width: 375, height: 720 } })

  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
  })

  /**
   * Fails if the row is wired to anything but the handler the header's score
   * control calls: application.tsx only writes `score` back onto the selected
   * entry after PATCH /api/v1/entries/:id resolves, so the row coming back
   * checked is the server's answer, not the click's optimism. The reload half
   * then shows the score outlived the React tree that set it.
   */
  test("scoring from the overflow menu reaches the server", async ({ page }) => {
    await openFirstEntry(page)
    await openOverflowMenu(page)

    await page.getByRole("menuitemradio", { name: "Score 3" }).click()

    // toBeChecked covers checkbox/radio/switch, not menuitemradio, so the
    // ARIA state is asserted directly.
    await openOverflowMenu(page)
    await expect(
      page.getByRole("menuitemradio", { name: "Score 3" })
    ).toHaveAttribute("aria-checked", "true")
    await page.keyboard.press("Escape")

    await page.reload()
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
    await openFirstEntry(page)
    await openOverflowMenu(page)

    await expect(
      page.getByRole("menuitemradio", { name: "Score 3" })
    ).toHaveAttribute("aria-checked", "true")
  })

  test("the note editor opens from the overflow menu", async ({ page }) => {
    await openFirstEntry(page)
    await openOverflowMenu(page)

    await page.getByRole("menuitem", { name: /add note|edit note/i }).click()

    await expect(
      page.getByPlaceholder("Add a note about this article...")
    ).toBeVisible()
  })

  test("the framing toggle works from the overflow menu", async ({ page }) => {
    await page.route("https://e2e.invalid/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><html><body><h1>Embedded page</h1></body></html>",
      })
    )
    await page.route("**/api/v1/entries/*/embed_policy", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "embeddable", reason: null }),
      })
    )

    await openFirstEntry(page)
    await openOverflowMenu(page)

    await page.getByRole("menuitem", { name: "Show original page" }).click()

    await expect(page.locator("iframe[src^='https://e2e.invalid/']")).toBeVisible()
  })

  test("the follow-story dialog opens from the overflow menu", async ({ page }) => {
    // FollowStoryDialog asks the query extractor for a topic the moment it
    // opens, and that runs a real LLM call. What is under test is the menu row
    // reaching the dialog, so the extraction is answered here rather than left
    // to whatever the host does or does not have an LLM on.
    await page.route("**/api/v1/stories/extract_from_entry", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          topic: "A followed topic",
          queries: ["a query"],
          source_entry_id: 1,
        }),
      })
    )

    await openFirstEntry(page)
    await openOverflowMenu(page)

    await page.getByRole("menuitem", { name: "Follow this story" }).click()

    // By name, not just by role: SidebarDrawer is mounted at every mobile width
    // as a role="dialog" parked off-canvas, so a bare dialog lookup matches two.
    await expect(
      page.getByRole("dialog", { name: "Follow this story" })
    ).toBeVisible()
  })
})

/**
 * The sharpest instance of the original defect: the fallback for a site that
 * refuses framing told the reader to "Press i", which on a phone is advice
 * about a key that does not exist reaching a toggle that is not on screen.
 */
test.describe("Embed-blocked fallback on a 375px phone", () => {
  test.use({ viewport: { width: 375, height: 720 } })

  test.beforeEach(async ({ page }) => {
    await page.route("https://e2e.invalid/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><html><body><h1>Embedded page</h1></body></html>",
      })
    )
    await page.route("**/api/v1/entries/*/embed_policy", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "blocked", reason: "x-frame-options: deny" }),
      })
    )

    // Same reasoning as embed-block-fallback.spec.ts: start in iframe view from
    // the first render rather than racing the preferences fetch with a keypress.
    const response = await page.request.patch("/api/v1/preferences", {
      data: { content_view_mode: "iframe" },
    })
    expect(response.ok()).toBe(true)

    await page.goto("/")
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
    await openFirstEntry(page)
  })

  test("the way back to the feed's copy is a button, not a keystroke", async ({
    page,
  }) => {
    const fallback = page.getByTestId("embed-blocked-fallback")
    await expect(fallback).toBeVisible()

    await expect(fallback.getByText(/press i/i)).toHaveCount(0)

    const back = fallback.getByRole("button", { name: "Show the feed's copy" })
    await expect(back).toBeVisible()
    await back.click()

    await expect(fallback).toBeHidden()
    await expect(page.locator("iframe[src^='https://e2e.invalid/']")).toHaveCount(0)
  })
})
