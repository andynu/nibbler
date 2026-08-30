import { test, expect, type Page } from "./fixtures"
import { FeedsPage } from "./pages"

/**
 * The entry list's own sort, and the two loads racing underneath it.
 *
 * Sorting is server-side and the chosen sort is a preference: a click on a
 * column header writes `entries_sort_config`, and the resolved string goes out
 * as the `sort` param of a fresh `/api/v1/entries` request. Both halves of
 * that had a race with the app's own boot traffic, and both discarded a sort
 * the reader had already clicked:
 *
 *   - the preferences GET returns every key and its reply replaced state
 *     wholesale, so a write landing in between vanished;
 *   - the entries GET had no sequence guard, so the boot list could be
 *     delivered after the sorted one and overwrite it.
 *
 * They are the same defect from the reader's side and were indistinguishable
 * from outside until the first was fixed, because that one reverted the header
 * as well as the rows. Each example below forces its own interleaving rather
 * than waiting for it: the natural race failed 7 runs in 60 under Chromium,
 * these fail every run on the unfixed code.
 *
 * Z-A over the fixture set starts at "YJIT in production" whatever collation
 * the server runs; date-descending starts at the newest article seeded.
 */

const TITLE_DESC_FIRST = "YJIT in production"
const DATE_DESC_FIRST = "Rust 1.90 stabilises const generics"

/**
 * Which column the list is sorted by, read the way a reader sees it. The
 * header buttons carry no aria-sort; the active one is the only one that
 * renders a direction chevron beside its label.
 */
async function activeSortColumn(page: Page): Promise<string[]> {
  const active: string[] = []
  for (const name of ["Date", "Feed", "Title", "Score"]) {
    const chevrons = await page
      .getByRole("button", { name, exact: true })
      .locator("svg")
      .count()
    if (chevrons > 0) active.push(name)
  }
  return active
}

test.describe("Entry list sorting", () => {
  test("a sort clicked before the preferences arrive survives them", async ({ page }) => {
    // Hold the boot preferences reply until the sort has been clicked and the
    // list has obeyed it. Releasing it then is the losing interleaving: the
    // reply carries no entries_sort_config, because the account has never
    // stored one, and used to take the reader's sort down with it.
    let releasePreferences: () => void = () => {}
    const preferencesHeld = new Promise<void>((resolve) => {
      releasePreferences = resolve
    })
    let preferenceReads = 0

    await page.route(/\/api\/v1\/preferences/, async (route) => {
      // The click's own PATCH must go through untouched; only the read waits.
      if (route.request().method() !== "GET") return route.continue()
      preferenceReads += 1
      const mine = preferenceReads
      const response = await route.fetch()
      if (mine === 1) await preferencesHeld
      await route.fulfill({ response })
    })

    const feedsPage = new FeedsPage(page)
    await page.goto("/")
    await feedsPage.waitForReady()

    // The header row renders from the display mode alone rather than from the
    // rows, so it is clickable while boot traffic is still outstanding, which
    // is the window a reader clicking straight after load lands in.
    await page.getByRole("button", { name: "Title", exact: true }).click()
    await expect
      .poll(async () => (await feedsPage.getEntryTitles())[0])
      .toBe(TITLE_DESC_FIRST)

    releasePreferences()

    // The reply must leave both the rows and the header where the reader put
    // them. Asserting the header too is what pins the failure mode: this one
    // reverted it, the entries race below does not.
    await expect(page.getByRole("listbox", { name: "Entries" })).toBeVisible()
    await expect
      .poll(async () => (await feedsPage.getEntryTitles())[0])
      .toBe(TITLE_DESC_FIRST)
    expect(await activeSortColumn(page)).toEqual(["Title"])
  })

  test("a sort clicked before the first list arrives is not undone by it", async ({ page }) => {
    // Hold the boot list's reply until the sorted one has been delivered, so
    // the two arrive in the opposite order to the one they were asked in.
    let releaseFirstReply: () => void = () => {}
    const firstReplyHeld = new Promise<void>((resolve) => {
      releaseFirstReply = resolve
    })
    let entriesRequests = 0

    // The list endpoint only: /api/v1/entries/:id and /api/v1/search have to
    // keep answering normally.
    await page.route(/\/api\/v1\/entries\?/, async (route) => {
      entriesRequests += 1
      const mine = entriesRequests
      // Fetched straight away so both requests genuinely reach the server;
      // only the moment the page is allowed to see the reply is ours.
      const response = await route.fetch()
      if (mine === 1) await firstReplyHeld
      await route.fulfill({ response })
      if (mine === 2) releaseFirstReply()
    })

    const feedsPage = new FeedsPage(page)
    await page.goto("/")
    await feedsPage.waitForReady()

    await page.getByRole("button", { name: "Title", exact: true }).click()

    await expect
      .poll(async () => (await feedsPage.getEntryTitles())[0])
      .toBe(TITLE_DESC_FIRST)

    // Both loads have been answered by now, so nothing is left in flight that
    // could still undo the ordering; the stale one has already had its chance.
    expect(entriesRequests).toBeGreaterThanOrEqual(2)
    expect(await feedsPage.getEntryTitles()).not.toContain(undefined)
    expect((await feedsPage.getEntryTitles())[0]).not.toBe(DATE_DESC_FIRST)
    expect(await activeSortColumn(page)).toEqual(["Title"])
  })
})
