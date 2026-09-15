import { test, expect, type Page } from "./fixtures"
import { FeedsPage } from "./pages"

/**
 * Two actions on the open article whose replies overlap.
 *
 * Each action awaits its own request before writing the article back. When a
 * second action lands while the first is still in flight, the first one's
 * reply must patch only the field it changed; writing back the copy of the
 * article it started from would undo the second action on screen while the
 * server kept it.
 *
 * Each example holds one reply until the other action has landed, so the
 * losing interleaving happens every run rather than when the network allows.
 */

// Seeded already read and not starred, so opening it toggles nothing and both
// header buttons start from a known label.
const READ_UNSTARRED = "Async runtimes compared"

function header(page: Page) {
  return page.getByTestId("entry-header")
}

function headerButton(page: Page, name: string) {
  return header(page).getByRole("button", { name, exact: true })
}

/**
 * Holds the reply of the first request matching `url` and one of `methods`
 * until `release` is called. The request still reaches the server straight
 * away; only the moment the page sees the answer is ours.
 */
async function holdFirstReply(page: Page, url: RegExp, methods: string[]) {
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let reachedServer: () => void = () => {}
  const fetched = new Promise<void>((resolve) => {
    reachedServer = resolve
  })
  let requests = 0

  await page.route(url, async (route) => {
    if (!methods.includes(route.request().method())) return route.continue()
    requests += 1
    const mine = requests
    const response = await route.fetch()
    if (mine === 1) {
      reachedServer()
      await held
    }
    await route.fulfill({ response })
  })

  return { fetched, release }
}

async function openReadUnstarredArticle(page: Page) {
  const feedsPage = new FeedsPage(page)
  await feedsPage.goto()
  await feedsPage.selectEntryByTitle(READ_UNSTARRED)
  await expect(headerButton(page, "Mark as unread")).toBeVisible()
  await expect(headerButton(page, "Add star")).toBeVisible()
}

test.describe("Overlapping article actions", () => {
  test("a star reply landing after a read toggle keeps the read toggle", async ({ page }) => {
    const star = await holdFirstReply(page, /\/api\/v1\/entries\/\d+\/toggle_starred/, ["POST"])
    await openReadUnstarredArticle(page)

    await headerButton(page, "Add star").click()
    await star.fetched

    await headerButton(page, "Mark as unread").click()
    await expect(headerButton(page, "Mark as read")).toBeVisible()

    star.release()
    await expect(headerButton(page, "Remove star")).toBeVisible()

    // Both fields come from the same write, so by the time the star shows the
    // read state is final and a revert cannot still be on its way.
    await expect(headerButton(page, "Mark as read")).toBeVisible()
    await expect(headerButton(page, "Mark as unread")).toHaveCount(0)
  })

  test("a note save landing after a star keeps the star", async ({ page }) => {
    // The update endpoint only; opening the article GETs the same path.
    const note = await holdFirstReply(page, /\/api\/v1\/entries\/\d+$/, ["PATCH", "PUT"])
    await openReadUnstarredArticle(page)

    await headerButton(page, "Add note").click()
    await page.getByPlaceholder("Add a note about this article...").fill("Compare with tokio")
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await note.fetched

    await headerButton(page, "Add star").click()
    await expect(headerButton(page, "Remove star")).toBeVisible()

    note.release()
    await expect(headerButton(page, "Edit note")).toBeVisible()

    await expect(headerButton(page, "Remove star")).toBeVisible()
    await expect(headerButton(page, "Add star")).toHaveCount(0)
  })
})
