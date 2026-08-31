import { test, expect, type Locator, type Page } from "./fixtures"

/**
 * What the phone's three panes are allowed to have under the bottom nav bar,
 * which is nothing (ttrb-0apn).
 *
 * MobileNavBar is `fixed bottom-0` and paints over whatever the panes lay out
 * beneath it. application.tsx sizes the main row to deduct it, and that part
 * worked: the row measured 664 of 720 at 375x720. The panes did not follow.
 * The list and article panes are `position: absolute` on mobile and the main
 * row was `position: static`, so their containing block was the initial one -
 * the viewport - and `height: 100%` resolved against 720 rather than against
 * the row that had done the deducting. The sidebar drawer is `fixed` and was
 * pinned `inset-y-0`, which is the same 720 by a different route.
 *
 * The consequence for a reader: with a full list scrolled to its maximum the
 * last row sat at 660.75..716 against a nav bar starting at 663, about two
 * pixels proud of it, with no scroll left to clear it. It could not be tapped
 * at all - `elementFromPoint` at the row's centre answered with the nav bar's
 * button, and Playwright's click timed out on the same interception.
 *
 * Why a browser spec and not component assertions: vitest runs on happy-dom,
 * which loads no stylesheet, resolves no `calc()`, and lays nothing out. Every
 * box there is zero by zero, so occlusion is not observable and a `fixed`
 * overlay intercepts nothing. Only a real engine with the real application.css
 * can say whether a row is under the nav bar.
 *
 * Note what is not enough as an assertion. `toBeVisible()` and
 * `toBeInViewport()` both pass for a row two pixels proud of an opaque overlay,
 * because neither asks what would receive the tap. The load-bearing examples
 * here click the row and check that the article it names actually opened.
 *
 * 375x720 is an iPhone SE/12 mini in portrait, under the 640px mobile
 * breakpoint LayoutContext switches panes at.
 */

const NAV_BAR = "mobile-nav-bar"

const navBar = (page: Page) => page.getByTestId(NAV_BAR)

const entryRows = (page: Page) =>
  page.getByRole("listbox", { name: "Entries" }).getByRole("option")

const entryListViewport = (page: Page) =>
  page.locator("[data-slot='scroll-area-viewport']:has([role='listbox'][aria-label='Entries'])")

const articleViewport = (page: Page) =>
  page.locator("[data-slot='scroll-area-viewport']:has(article)")

const sidebarDrawer = (page: Page) =>
  page.getByRole("dialog", { name: "Feed sidebar" })

const sidebarViewport = (page: Page) =>
  sidebarDrawer(page).locator("[data-slot='scroll-area-viewport']")

/**
 * Fails when any part of `pane` is drawn under the nav bar.
 *
 * Flush is allowed: a scroller whose bottom edge is the nav bar's top edge has
 * every pixel of its content in the clear, which is the property under test.
 */
async function expectClearOfNavBar(pane: Locator, page: Page): Promise<void> {
  const paneBox = await pane.boundingBox()
  const navBox = await navBar(page).boundingBox()
  if (!paneBox || !navBox) throw new Error("expected both boxes to be laid out")

  expect(
    paneBox.y + paneBox.height,
    `pane bottom ${paneBox.y + paneBox.height} against nav bar top ${navBox.y}`
  ).toBeLessThanOrEqual(navBox.y)
}

test.describe("The phone panes against the bottom nav bar", () => {
  test.use({ viewport: { width: 375, height: 720 } })

  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
    await expect(navBar(page)).toBeVisible()
  })

  // The premise the rest of the file rests on. If the nav bar stops being an
  // opaque bar pinned to the bottom, these examples are measuring nothing.
  test("the nav bar is pinned to the bottom of the viewport", async ({ page }) => {
    const navBox = await navBar(page).boundingBox()
    const height = page.viewportSize()!.height

    expect(navBox).not.toBeNull()
    expect(navBox!.y + navBox!.height).toBeCloseTo(height, 0)
    expect(navBox!.height).toBeGreaterThan(0)
  })

  test("the entry list's scroller stops above the nav bar", async ({ page }) => {
    await expect(entryRows(page).first()).toBeVisible()

    await expectClearOfNavBar(entryListViewport(page), page)
  })

  test("the last row of a full list can be tapped", async ({ page }) => {
    const rows = entryRows(page)
    await expect(rows.first()).toBeVisible()

    // A full list, not a truncated one: the defect only bites when the content
    // is taller than the scroller, so an example served two rows would pass
    // against the unfixed layout.
    const count = await rows.count()
    expect(count).toBeGreaterThan(10)

    const last = rows.last()
    const title = await last.getAttribute("data-entry-title")
    expect(title).toBeTruthy()

    // click() scrolls the row into its scroller and then hit-tests it, which is
    // where the unfixed layout fails: the row arrives two pixels above the nav
    // bar and the nav bar's button takes the tap.
    await last.click()

    await expect(page.getByRole("heading", { level: 1, name: title! })).toBeVisible()
  })

  test("the article pane's scroller stops above the nav bar", async ({ page }) => {
    await expect(entryRows(page).first()).toBeVisible()
    await entryRows(page).first().click()
    await expect(page.getByTestId("entry-header")).toBeVisible()

    await expectClearOfNavBar(articleViewport(page), page)
  })

  test("the sidebar drawer stops above the nav bar", async ({ page }) => {
    await page.getByRole("button", { name: "Feeds", exact: true }).click()
    await expect(sidebarDrawer(page)).toBeVisible()

    await expectClearOfNavBar(sidebarDrawer(page), page)
    await expectClearOfNavBar(sidebarViewport(page), page)
  })

  test("the last feed in the sidebar can be tapped", async ({ page }) => {
    await page.getByRole("button", { name: "Feeds", exact: true }).click()
    await expect(sidebarDrawer(page)).toBeVisible()

    // Field Notes is the last feed E2eDataset seeds and the last row of the
    // tree, below the three categories and their feeds. Selecting it closes the
    // drawer and retitles the list, which is what proves the tap landed on the
    // row rather than on the nav bar drawn over it.
    // The row itself, not the per-feed menu trigger beside it, which the
    // sidebar names "Field Notes menu". The row's own name carries its unread
    // count ("Field Notes 4").
    const fieldNotes = sidebarDrawer(page).getByRole("button", {
      name: /^Field Notes( \d+)?$/,
    })
    await fieldNotes.click()

    // The list's own heading, not the drawer's row: the drawer stays mounted
    // and merely translates off-screen, so its disappearance proves nothing.
    await expect(
      page.getByRole("heading", { level: 2, name: "Field Notes" })
    ).toBeVisible()
  })
})
