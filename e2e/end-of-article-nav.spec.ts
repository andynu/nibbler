import { test, expect, type Page } from "./fixtures"

/**
 * The control a scroll reader reaches at the end of the article (ttrb-fixw).
 *
 * Advancing used to mean a horizontal swipe or the back-to-list pane, both
 * gestures made with the article still on screen. Reaching the end of the text
 * is the moment the reader has decided to move on, and there was nothing there.
 *
 * Why a browser spec and not component assertions: vitest runs on happy-dom,
 * which loads no stylesheet, lays nothing out and answers every query at every
 * width. Nothing about this control being below the fold, reachable by a real
 * scroll gesture, or fitting inside a 375px pane can be shown there. The
 * component suite (EntryContent.test.tsx) covers the wiring - which handler the
 * press runs, what is drawn at the end of the list - and says so.
 *
 * 375 is an iPhone SE/12 mini in portrait, the width two other defects landed
 * at today. The desktop example at the bottom is deliberate: the control is
 * drawn at every width, because a desktop reader who scrolls hits the same dead
 * end and a keyboard reader never scrolls far enough to meet it.
 */

/**
 * A body long enough that the end of the article is well below the fold at any
 * viewport this suite renders. The seeded articles are two short paragraphs and
 * would put the control on screen from the start, which would prove nothing
 * about scrolling to it.
 */
const LONG_ARTICLE_HTML = Array.from(
  { length: 40 },
  (_, index) =>
    `<p>Paragraph ${index + 1} of a long seeded article, here so the reading ` +
    `pane has more text than it can show at once and the end of the body is ` +
    `somewhere the reader has to scroll to reach.</p>`
).join("\n")

/**
 * A title long enough to overflow a 375px button on one line, so the wrapping
 * this control relies on is under test rather than assumed. Every headline the
 * fixture seeds fits, which is the uninteresting case.
 */
const LONG_NEXT_TITLE =
  "A deliberately long headline about the borrow checker that no phone-width button can hold on a single line"

/**
 * Serves a two-article list, gives both articles a long body, and renames the
 * second to LONG_NEXT_TITLE. The second article is what the end-of-article
 * button names on the first, and is itself the end of the list.
 *
 * Interception rather than fixture rows: a dozen specs assert on the seeded
 * entry counts and titles, and neither a 40-paragraph body nor a 103-character
 * headline is wanted anywhere else.
 *
 * Two rows rather than the seeded twenty-four for a second reason: the last row
 * of a full list cannot be tapped at 375px at all. The list's scroll viewport
 * runs to 100vh, under the fixed MobileNavBar, so the final row is clipped and
 * painted over with about 2px showing and no scroll left to clear it. That is a
 * separate defect, measured and filed as ttrb-0apn; working around it here
 * keeps this spec about the control it is named for.
 */
async function serveLongArticles(page: Page): Promise<void> {
  let longTitleEntryId: number | null = null

  // The list endpoint, with or without a query string, and never /entries/:id
  // or /entries/counters.
  await page.route(/\/api\/v1\/entries(\?|$)/, async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as {
      entries: Array<Record<string, unknown>>
      pagination: Record<string, unknown>
    }

    const entries = body.entries
      .slice(0, 2)
      .map((entry, index) =>
        index === 1 ? { ...entry, title: LONG_NEXT_TITLE } : entry
      )
    longTitleEntryId = (entries[1]?.id as number) ?? null

    await route.fulfill({
      response,
      json: {
        ...body,
        entries,
        pagination: { ...body.pagination, total: entries.length, total_pages: 1 },
      },
    })
  })

  // The detail response carries its own copy of the title, and it is the one
  // the reading pane renders once the article opens. Without this the button
  // would name one headline and the article would open under another - which is
  // exactly the drift the "opens the article it names" example is checking for,
  // so it has to be the app's doing and not the fixture's.
  await page.route(/\/api\/v1\/entries\/\d+$/, async (route) => {
    const response = await route.fetch()
    const entry = (await response.json()) as Record<string, unknown>
    const renamed =
      entry.id === longTitleEntryId ? { title: LONG_NEXT_TITLE } : {}

    await route.fulfill({
      response,
      json: { ...entry, ...renamed, content: LONG_ARTICLE_HTML },
    })
  })
}

/** The article pane's own scroll viewport; the sidebar and the list have theirs. */
const articleViewport = (page: Page) =>
  page.locator("[data-slot='scroll-area-viewport']:has(article)")

const endOfArticleNav = (page: Page) => page.getByTestId("end-of-article-nav")

const nextArticleButton = (page: Page) =>
  page.getByRole("button", { name: /^Next article/ })

const entryRows = (page: Page) =>
  page.getByRole("listbox", { name: "Entries" }).getByRole("option")

async function openEntry(page: Page, which: "first" | "last"): Promise<void> {
  const rows = entryRows(page)
  await expect(rows.first()).toBeVisible()

  await (which === "first" ? rows.first() : rows.last()).click()
  await expect(page.getByTestId("entry-header")).toBeVisible()
  await expect(articleViewport(page)).toBeVisible()
}

/**
 * Wheels the reading pane down one step and answers with how far it got, for
 * expect.poll. A gesture rather than an assignment to `scrollTop`: the claim is
 * that a reader scrolling the article arrives at this control, and script can
 * scroll boxes a reader cannot. Repeated because Firefox caps how far a single
 * wheel event carries a scroller.
 */
const wheelingScrollTop = (page: Page, step: number) => async () => {
  await page.mouse.wheel(0, step)
  return articleViewport(page).evaluate((element) => element.scrollTop)
}

async function scrollToEndOfArticle(page: Page): Promise<void> {
  // The cursor is parked by coordinate rather than by hovering a paragraph:
  // Playwright's hover hit-tests, and inside the prose block it finds <article>
  // over the <p> and retries until it times out. Any point inside the pane
  // sends the wheel to the same scroller.
  const pane = await articleViewport(page).boundingBox()
  if (!pane) throw new Error("the article pane has no box to scroll")
  await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2)

  const maxScrollTop = await articleViewport(page).evaluate(
    (element) => element.scrollHeight - element.clientHeight
  )
  expect(maxScrollTop).toBeGreaterThan(0)

  await expect
    .poll(wheelingScrollTop(page, 600), { timeout: 10000 })
    .toBeGreaterThanOrEqual(maxScrollTop - 2)
}

test.describe("The end-of-article next control at 375px", () => {
  test.use({ viewport: { width: 375, height: 720 } })

  test.beforeEach(async ({ page }) => {
    await serveLongArticles(page)

    await page.goto("/")
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
  })

  /**
   * The premise, and the reason the control is worth having at all: it is below
   * the text, not floating over it, so it costs the reader nothing until the
   * text runs out.
   */
  test("is below the fold until the reader scrolls to it", async ({ page }) => {
    await openEntry(page, "first")

    const paneBottom = await articleViewport(page).evaluate(
      (element) => element.getBoundingClientRect().bottom
    )
    const navTop = await endOfArticleNav(page).evaluate(
      (element) => element.getBoundingClientRect().top
    )
    expect(navTop).toBeGreaterThan(paneBottom)

    await scrollToEndOfArticle(page)

    await expect(nextArticleButton(page)).toBeInViewport()
  })

  /**
   * A geometry check, not an eyeball. The label names an article, article titles
   * are as long as they are, and the Button base sets `whitespace-nowrap` and a
   * fixed height - both of which this control has to undo or the title overhangs
   * its own border at phone width the way ttrb-rtti's label did.
   */
  test("holds a long next title inside the pane rather than overhanging it", async ({
    page,
  }) => {
    await openEntry(page, "first")
    await scrollToEndOfArticle(page)

    const button = nextArticleButton(page)
    await expect(button).toContainText(LONG_NEXT_TITLE)

    const box = await button.evaluate((element) => {
      const label = element.querySelector("span") as HTMLElement
      return {
        button: element.getBoundingClientRect(),
        label: label.getBoundingClientRect(),
        pane: (
          element.closest("[data-slot='scroll-area-viewport']") as HTMLElement
        ).getBoundingClientRect(),
      }
    })

    // Inside the pane on both edges.
    expect(box.button.left).toBeGreaterThanOrEqual(box.pane.left)
    expect(box.button.right).toBeLessThanOrEqual(box.pane.right + 0.5)

    // And the title inside the button. A label wider than its own button is the
    // overhang; a taller-than-one-line button is the wrap that prevents it.
    expect(box.label.right).toBeLessThanOrEqual(box.button.right)
    expect(box.button.height).toBeGreaterThan(48)

    // The control must not have made the article pane scroll sideways.
    const overflowsSideways = await articleViewport(page).evaluate(
      (element) => element.scrollWidth > element.clientWidth
    )
    expect(overflowsSideways).toBe(false)
  })

  /**
   * The whole point of the control, end to end: it names an article, pressing it
   * opens that article, and the article opens at its beginning rather than at
   * the offset the reader had scrolled the previous one to.
   */
  test("opens the article it names, scrolled to the top", async ({ page }) => {
    await openEntry(page, "first")
    await scrollToEndOfArticle(page)

    await nextArticleButton(page).click()

    await expect(
      page.locator("article h1").getByRole("link", { name: LONG_NEXT_TITLE })
    ).toBeVisible()
    await expect
      .poll(() => articleViewport(page).evaluate((element) => element.scrollTop))
      .toBe(0)
  })

  /**
   * The failure mode this project has hit repeatedly is a control that silently
   * does nothing. At the end of the list there is no next article to name, so
   * the control is not a button at all.
   */
  test("says the list is finished at the last article", async ({ page }) => {
    await openEntry(page, "last")
    await expect(page.getByRole("button", { name: "Next entry" })).toBeDisabled()

    await scrollToEndOfArticle(page)

    await expect(
      page.getByText("That was the last article in this list.")
    ).toBeVisible()
    await expect(nextArticleButton(page)).toHaveCount(0)
  })
})

/**
 * Drawn at desktop width too. A scroll reader on a wide screen reaches the same
 * dead end at the end of the text, and the reader who presses `j` never scrolls
 * this far, so nothing is spent on them.
 */
test.describe("The end-of-article next control on a desktop viewport", () => {
  test.beforeEach(async ({ page }) => {
    await serveLongArticles(page)

    await page.goto("/")
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
  })

  test("is reachable by scrolling and advances the reader", async ({ page }) => {
    await openEntry(page, "first")
    await scrollToEndOfArticle(page)

    await expect(nextArticleButton(page)).toBeInViewport()

    await nextArticleButton(page).click()

    await expect(
      page.locator("article h1").getByRole("link", { name: LONG_NEXT_TITLE })
    ).toBeVisible()
  })
})
