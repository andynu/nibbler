import { test, expect, type Page } from "./fixtures"

/**
 * Copying the open article's URL, against a real clipboard (ttrb-rtti).
 *
 * Chromium only, and not for want of trying: `clipboard-read` and
 * `clipboard-write` are Chromium permission names, and granting them under
 * Firefox throws `Unknown permission`. Firefox also has no way to read the
 * system clipboard back from a test, so the half of this that matters -- the
 * URL actually landed, and it is the publisher's rather than a Nibbler route
 * -- cannot be asserted there at all. Same shape as the pull-to-refresh spec,
 * which is Chromium-only for CDP touch injection.
 *
 * What only a real browser can show: `navigator.clipboard` exists at all.
 * It is absent outside a secure context, so a passing run here is also the
 * evidence that the harness's http://127.0.0.1 origin counts as one. The
 * component tests stub the API and can say nothing about that.
 */

/** The header's "Open in new tab" anchor carries the same entry.link `c` copies. */
async function openFirstEntry(page: Page) {
  const rows = page.getByRole("listbox", { name: "Entries" }).getByRole("option")
  await expect(rows.first()).toBeVisible()

  await rows.first().click()
  await expect(page.getByTestId("entry-header")).toBeVisible()

  const link = await page
    .getByRole("link", { name: "Open in new tab" })
    .getAttribute("href")
  expect(link).toBeTruthy()
  return link as string
}

const indicator = (page: Page) => page.getByTestId("copy-link-status")

const clipboardText = (page: Page) =>
  page.evaluate(() => navigator.clipboard.readText())

test.describe("copying the article link", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "clipboard-read/clipboard-write are Chromium-only permissions"
  )

  test.beforeEach(async ({ context, page }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await page.goto("/")
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
  })

  test("c copies the publisher's URL and confirms it on screen", async ({ page }) => {
    const link = await openFirstEntry(page)

    await page.keyboard.press("c")

    await expect(indicator(page)).toHaveText(/Link copied/)
    expect(await clipboardText(page)).toBe(link)
  })

  // A confirmation that stayed put would become permanent header chrome.
  test("the confirmation clears itself", async ({ page }) => {
    await openFirstEntry(page)

    await page.keyboard.press("c")
    await expect(indicator(page)).toHaveText(/Link copied/)

    await expect(indicator(page)).toHaveText("")
  })

  // The catalog's own rule, not this shortcut's: useKeyboardCommands drops any
  // event whose target is an input, so typing a word with a c in it into the
  // search box must not fire this.
  test("typing c in the search box does not copy", async ({ page }) => {
    await openFirstEntry(page)

    const search = page.getByRole("searchbox", { name: "Search articles" })
    await search.click()
    // Real keystrokes, one keydown each: `fill` sets the value without any,
    // which is the opposite of what this is checking.
    await search.pressSequentially("clipboard")

    await expect(search).toHaveValue("clipboard")
    await expect(indicator(page)).toHaveText("")
  })
})

/**
 * The phone has no `c` to press, so the overflow menu is the whole of its
 * access to this (ttrb-tyvd's discipline: same handler, not a second copy).
 */
test.describe("copying the article link on a 375px phone", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "clipboard-read/clipboard-write are Chromium-only permissions"
  )
  test.use({ viewport: { width: 375, height: 720 } })

  test("the overflow menu copies the same URL", async ({ context, page }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await page.goto("/")
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })

    const link = await openFirstEntry(page)

    await page.getByRole("button", { name: "More article actions" }).click()
    await expect(page.getByRole("menu")).toBeVisible()
    await page.getByRole("menuitem", { name: "Copy link" }).click()

    await expect(indicator(page)).toHaveText(/Link copied/)
    expect(await clipboardText(page)).toBe(link)

    // The 48px header is nearly full at this width, and the confirmation is
    // drawn in the flexible middle rather than in the action cluster. A
    // confirmation painted over the read and star buttons would be its own
    // defect, so the geometry is asserted rather than assumed.
    const chip = await indicator(page).boundingBox()
    const firstAction = await page
      .getByTestId("entry-header")
      .getByRole("button", { name: /mark as (read|unread)/i })
      .boundingBox()
    expect(chip?.width).toBeGreaterThan(0)
    expect(chip!.x + chip!.width).toBeLessThanOrEqual(firstAction!.x)
  })
})
