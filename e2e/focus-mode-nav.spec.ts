import { test, expect, type Page } from "./fixtures"

/**
 * The focus-mode header as a nav bar (ttrb-3kh4).
 *
 * Focus mode collapses the sidebar and the list to 0px, so the entry header is
 * the only Nibbler chrome left. What it says about the walk, and whether its
 * prev/next still move, can only be checked with the real list loaded behind
 * it, which is why this lives here rather than in the component tests.
 */
const entryRows = (page: Page) =>
  page.getByRole("listbox", { name: "Entries" }).getByRole("option")

const header = (page: Page) => page.getByTestId("entry-header")

// The position readout, e.g. "3 / 42". Found by its own tooltip so the
// assertions do not depend on how many entries the seed happens to produce.
const position = (page: Page) => header(page).getByTitle(/^Entry \d+ of \d+$/)

async function enterFocusMode(page: Page) {
  await expect(entryRows(page).first()).toBeVisible()
  await page.keyboard.press("j")
  await page.keyboard.press("Shift+F")
  await expect(page.getByRole("button", { name: "Exit focus mode" })).toBeVisible()
}

test.describe("Focus mode navigation bar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
  })

  test("names the list being walked and where in it you are", async ({ page }) => {
    // The list pane's own heading, so the check survives a different seed.
    const listName = (
      await page.getByRole("heading", { level: 2 }).first().textContent()
    )?.trim()
    expect(listName).toBeTruthy()

    await enterFocusMode(page)

    await expect(position(page)).toHaveText(/^1 \/ \d+$/)
    await expect(header(page).getByText(listName!, { exact: true })).toBeVisible()
  })

  test("prev and next move the same way j and k do", async ({ page }) => {
    await enterFocusMode(page)
    await expect(position(page)).toHaveText(/^1 \//)

    await page.getByRole("button", { name: "Next entry" }).click()
    await expect(position(page)).toHaveText(/^2 \//)

    await page.getByRole("button", { name: "Previous entry" }).click()
    await expect(position(page)).toHaveText(/^1 \//)

    // Same destination by key, which is the parity the bar is claiming.
    await page.keyboard.press("j")
    await expect(position(page)).toHaveText(/^2 \//)
  })

  test("stays a single row", async ({ page }) => {
    await enterFocusMode(page)

    // h-12. The orientation text has to fit beside the buttons, not below them.
    expect((await header(page).boundingBox())?.height).toBe(48)
  })
})
