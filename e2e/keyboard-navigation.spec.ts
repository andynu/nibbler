import { test, expect, type Page } from "./fixtures"
import { FeedsPage } from "./pages"

/**
 * Keyboard navigation E2E tests.
 *
 * Tests keyboard-driven navigation and actions throughout the application.
 * Every shortcut example asserts what its key changed on screen: a page that is
 * merely still standing after a press is also what a crashed app looks like.
 */

// Helper to wait for app to be ready
async function waitForAppReady(page: Page) {
  await page.goto("/")
  // Wait for NibbleRSS branding to confirm app is fully loaded
  await expect(page.getByText("NibbleRSS")).toBeVisible({ timeout: 10000 })
}

const entryList = (page: Page) => page.getByRole("listbox", { name: "Entries" })
const entryRows = (page: Page) => entryList(page).getByRole("option")
const selectedRows = (page: Page) =>
  entryList(page).locator("[role='option'][aria-selected='true']")

/** The open article's headline. EntryContent draws it once the entry has loaded. */
const articleHeadline = (page: Page) =>
  page.getByRole("article").getByRole("heading", { level: 1 })

const entryHeader = (page: Page) => page.getByTestId("entry-header")

/**
 * The list header is driven by the sidebar selection, so it is the visible
 * answer to "which view or category am I in".
 */
const listTitle = (page: Page) => page.getByRole("heading", { level: 2 })

/**
 * The headlines in list order. The list-walking shortcuts do nothing until the
 * rows are on screen, so this waits for them first.
 */
async function listedTitles(page: Page): Promise<string[]> {
  await expect(entryRows(page).first()).toBeVisible()
  return new FeedsPage(page).getEntryTitles()
}

/** The list highlights exactly this row and the reading pane shows the same entry. */
async function expectEntryOpen(page: Page, title: string) {
  await expect(selectedRows(page)).toHaveCount(1)
  await expect(selectedRows(page)).toHaveAttribute("data-entry-title", title)
  await expect(articleHeadline(page)).toHaveText(title)
}

test.describe("Article Navigation (j/k)", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("j opens the first entry", async ({ page }) => {
    const titles = await listedTitles(page)

    await page.keyboard.press("j")
    await expectEntryOpen(page, titles[0])
  })

  test("k with nothing open starts from the last entry", async ({ page }) => {
    const titles = await listedTitles(page)

    await page.keyboard.press("k")
    await expectEntryOpen(page, titles[titles.length - 1])
  })

  test("n key works as alias for j", async ({ page }) => {
    const titles = await listedTitles(page)

    await page.keyboard.press("n")
    await expectEntryOpen(page, titles[0])
  })

  test("j then k navigates back and forth", async ({ page }) => {
    const titles = await listedTitles(page)

    await page.keyboard.press("j")
    await expectEntryOpen(page, titles[0])
    await page.keyboard.press("j")
    await expectEntryOpen(page, titles[1])
    await page.keyboard.press("k")
    await expectEntryOpen(page, titles[0])
  })
})

test.describe("Category Navigation (Shift+J / Shift+K)", () => {
  // E2eDataset seeds Technology with the child Programming, then Science, which
  // the sidebar paints in that order.
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
    // The categories request has to have landed: with an empty tree the
    // shortcut has nowhere to go and would correctly do nothing.
    await expect(page.locator("[data-category-id]").first()).toBeVisible()
  })

  test("Shift+J moves the sidebar selection down the tree", async ({ page }) => {
    await expect(listTitle(page)).toHaveText("All Feeds")

    await page.keyboard.press("Shift+J")
    await expect(listTitle(page)).toHaveText("Technology")

    // Into the child folder rather than over it.
    await page.keyboard.press("Shift+J")
    await expect(listTitle(page)).toHaveText("Programming")

    // Out of a view scoped to a single category, which is the case that used
    // to do nothing at all.
    await page.keyboard.press("Shift+J")
    await expect(listTitle(page)).toHaveText("Science")
  })

  test("Shift+J stops at the last category instead of wrapping", async ({ page }) => {
    await page.keyboard.press("Shift+J")
    await page.keyboard.press("Shift+J")
    await page.keyboard.press("Shift+J")
    await expect(listTitle(page)).toHaveText("Science")

    await page.keyboard.press("Shift+J")
    await expect(listTitle(page)).toHaveText("Science")
  })

  test("Shift+K moves the sidebar selection back up the tree", async ({ page }) => {
    // From a virtual folder, the first press back lands on the last category.
    await page.keyboard.press("Shift+K")
    await expect(listTitle(page)).toHaveText("Science")

    await page.keyboard.press("Shift+K")
    await expect(listTitle(page)).toHaveText("Programming")

    await page.keyboard.press("Shift+K")
    await expect(listTitle(page)).toHaveText("Technology")
  })

  test("Shift+K stops at the first category instead of wrapping", async ({ page }) => {
    await page.keyboard.press("Shift+J")
    await expect(listTitle(page)).toHaveText("Technology")

    await page.keyboard.press("Shift+K")
    await expect(listTitle(page)).toHaveText("Technology")
  })

  test("Shift+J from a feed lands on the category after that feed's own", async ({
    page,
  }) => {
    // Rust Weekly lives in Programming, so the next category is Science. The
    // feed's accessible name carries its unread badge ("Rust Weekly 4") and the
    // row has a second button beside it ("Rust Weekly menu"), hence the
    // anchored pattern.
    await page
      .getByRole("navigation", { name: "Feeds" })
      .getByRole("button", { name: /^Rust Weekly(?! menu)/ })
      .click()
    await expect(listTitle(page)).toHaveText("Rust Weekly")

    await page.keyboard.press("Shift+J")
    await expect(listTitle(page)).toHaveText("Science")
  })
})

test.describe("Article Actions", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("o opens the first entry when none is open", async ({ page }) => {
    const titles = await listedTitles(page)

    await page.keyboard.press("o")
    await expectEntryOpen(page, titles[0])
  })

  test("Enter opens the first entry when none is open", async ({ page }) => {
    const titles = await listedTitles(page)

    await page.keyboard.press("Enter")
    await expectEntryOpen(page, titles[0])
  })

  test("Escape closes the open entry", async ({ page }) => {
    const titles = await listedTitles(page)
    await page.keyboard.press("j")
    await expectEntryOpen(page, titles[0])

    await page.keyboard.press("Escape")
    await expect(page.getByText("Select an entry to read")).toBeVisible()
    await expect(selectedRows(page)).toHaveCount(0)
  })

  // Read state is asserted on the row rather than the header: the header does
  // not pick up the read that opening an entry performs.
  test("m key toggles read status", async ({ page }) => {
    const titles = await listedTitles(page)
    const firstRow = entryRows(page).first()
    await expect(firstRow).toHaveAttribute("data-unread", "true")

    await page.keyboard.press("j")
    await expectEntryOpen(page, titles[0])
    await expect(firstRow).toHaveAttribute("data-unread", "false")

    await page.keyboard.press("m")
    await expect(firstRow).toHaveAttribute("data-unread", "true")

    await page.keyboard.press("m")
    await expect(firstRow).toHaveAttribute("data-unread", "false")
  })

  test("u key works as alias for m", async ({ page }) => {
    const titles = await listedTitles(page)
    const firstRow = entryRows(page).first()

    await page.keyboard.press("j")
    await expectEntryOpen(page, titles[0])
    await expect(firstRow).toHaveAttribute("data-unread", "false")

    await page.keyboard.press("u")
    await expect(firstRow).toHaveAttribute("data-unread", "true")
  })

  test("s key toggles starred", async ({ page }) => {
    const titles = await listedTitles(page)
    await page.keyboard.press("j")
    await expectEntryOpen(page, titles[0])
    const header = entryHeader(page)
    await expect(header.getByRole("button", { name: "Add star", exact: true })).toBeVisible()

    await page.keyboard.press("s")
    await expect(header.getByRole("button", { name: "Remove star", exact: true })).toBeVisible()

    await page.keyboard.press("s")
    await expect(header.getByRole("button", { name: "Add star", exact: true })).toBeVisible()
  })

  test("p key toggles the open entry in the public feed", async ({ page }) => {
    const titles = await listedTitles(page)
    await page.keyboard.press("j")
    await expectEntryOpen(page, titles[0])
    const header = entryHeader(page)
    await expect(
      header.getByRole("button", { name: "Add to public feed", exact: true })
    ).toBeVisible()

    await page.keyboard.press("p")
    await expect(
      header.getByRole("button", { name: "Remove from public feed", exact: true })
    ).toBeVisible()

    await page.keyboard.press("p")
    await expect(
      header.getByRole("button", { name: "Add to public feed", exact: true })
    ).toBeVisible()
  })

  test("r key reloads the list, closing the open entry", async ({ page }) => {
    const titles = await listedTitles(page)
    await page.keyboard.press("j")
    await expectEntryOpen(page, titles[0])

    const reload = page.waitForRequest(/\/api\/v1\/entries\?/)
    await page.keyboard.press("r")
    await reload

    await expect(page.getByText("Select an entry to read")).toBeVisible()
    await expect(entryRows(page)).toHaveCount(titles.length)
  })
})

test.describe("View Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("a key navigates to All view", async ({ page }) => {
    await page.keyboard.press("f")
    await expect(listTitle(page)).toHaveText("Fresh")

    await page.keyboard.press("a")
    await expect(listTitle(page)).toHaveText("All Feeds")
  })

  test("f key navigates to Fresh view", async ({ page }) => {
    await expect(listTitle(page)).toHaveText("All Feeds")

    await page.keyboard.press("f")
    await expect(listTitle(page)).toHaveText("Fresh")
  })

  test("Shift+S navigates to Starred view", async ({ page }) => {
    await expect(listTitle(page)).toHaveText("All Feeds")

    await page.keyboard.press("Shift+S")
    await expect(listTitle(page)).toHaveText("Starred")
  })
})

test.describe("Help Dialog", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("? opens keyboard shortcuts dialog", async ({ page }) => {
    await page.keyboard.press("Shift+?")

    // Dialog should appear
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible({ timeout: 2000 })
    await expect(
      page.getByRole("heading", { name: "Keyboard Shortcuts" })
    ).toBeVisible()
  })

  test("Escape closes help dialog", async ({ page }) => {
    await page.keyboard.press("Shift+?")
    await expect(page.getByRole("dialog")).toBeVisible()

    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 2000 })
  })

  test("help dialog shows navigation shortcuts", async ({ page }) => {
    await page.keyboard.press("Shift+?")
    await expect(page.getByRole("dialog")).toBeVisible()

    // Check that navigation shortcuts are documented. Match the row labels
    // exactly: the dialog also lists "Page up, then previous entry", which a
    // loose regex would collide with under Playwright strict mode.
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("Next entry", { exact: true })).toBeVisible()
    await expect(
      dialog.getByText("Previous entry", { exact: true })
    ).toBeVisible()
  })

  test("help dialog shows action shortcuts", async ({ page }) => {
    await page.keyboard.press("Shift+?")
    await expect(page.getByRole("dialog")).toBeVisible()

    // Check that action shortcuts are documented. Scope to the dialog and
    // match the row labels exactly: the Actions section lists five "Toggle ..."
    // rows, so a loose regex would collide the moment one of them grows a
    // description containing another's phrase.
    const dialog = page.getByRole("dialog")
    await expect(
      dialog.getByText("Toggle read/unread", { exact: true })
    ).toBeVisible()
    await expect(
      dialog.getByText("Toggle starred", { exact: true })
    ).toBeVisible()
  })
})

test.describe("Command Palette", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("Ctrl+K opens command palette", async ({ page }) => {
    await page.keyboard.press("Control+k")

    // Command palette should appear
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2000 })
  })

  test("Meta+K opens command palette", async ({ page }) => {
    await page.keyboard.press("Meta+k")

    // Command palette should appear
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2000 })
  })

  test("Escape closes command palette", async ({ page }) => {
    await page.keyboard.press("Control+k")
    await expect(page.getByRole("dialog")).toBeVisible()

    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 2000 })
  })

  test("command palette has search input", async ({ page }) => {
    await page.keyboard.press("Control+k")
    await expect(page.getByRole("dialog")).toBeVisible()

    // Should have a search/combobox input
    const input = page.getByRole("combobox")
    await expect(input).toBeVisible()
  })
})

test.describe("Input Focus Handling", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("shortcuts disabled when typing in input", async ({ page }) => {
    // Open subscribe dialog via add menu
    const addButton = page.getByRole("button", { name: /add\.\.\./i })
    await expect(addButton).toBeVisible()
    await addButton.click()
    await page.getByText("Subscribe to Feed").click()
    await expect(page.getByRole("dialog")).toBeVisible()

    // Find the input and type
    const input = page.getByRole("textbox").first()
    await input.fill("j")

    // The 'j' should be in the input, not triggering navigation
    await expect(input).toHaveValue("j")
  })

  test("shortcuts work after closing dialog", async ({ page }) => {
    const titles = await listedTitles(page)

    // Open and close a dialog
    const addButton = page.getByRole("button", { name: /add\.\.\./i })
    await expect(addButton).toBeVisible()
    await addButton.click()
    await page.getByText("Subscribe to Feed").click()
    await expect(page.getByRole("dialog")).toBeVisible()

    // Close dialog
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).not.toBeVisible()

    // Shortcuts should work again
    await page.keyboard.press("j")
    await expectEntryOpen(page, titles[0])
  })
})

test.describe("Rapid Key Sequences", () => {
  // A press navigates from the entry that is open when it lands, and an entry
  // only counts as open once its fetch returns, so a burst can advance fewer
  // rows than it has presses and fetches can land out of order. These examples
  // assert the rows a burst can settle on, not one row.
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  /**
   * One entry open, the same one highlighted in the list and shown in the
   * reading pane, and among `candidates`. Polled because a fetch from the burst
   * can still land after the presses are done.
   */
  async function expectOpenEntryAmong(page: Page, candidates: string[]) {
    await expect
      .poll(
        async () => {
          const highlighted = await selectedRows(page).evaluateAll((rows) =>
            rows.map((row) => row.getAttribute("data-entry-title") ?? "")
          )
          const shown = (await articleHeadline(page).allTextContents()).map((text) =>
            text.trim()
          )
          return (
            highlighted.length === 1 &&
            shown.length === 1 &&
            highlighted[0] === shown[0] &&
            candidates.includes(highlighted[0])
          )
        },
        { message: `the open entry should be one of: ${candidates.join(" | ")}` }
      )
      .toBe(true)
  }

  test("handles rapid j key presses", async ({ page }) => {
    const titles = await listedTitles(page)

    await page.keyboard.press("j")
    await page.keyboard.press("j")
    await page.keyboard.press("j")
    await expectOpenEntryAmong(page, titles.slice(0, 3))
  })

  test("handles rapid k key presses", async ({ page }) => {
    const titles = await listedTitles(page)

    await page.keyboard.press("k")
    await page.keyboard.press("k")
    await page.keyboard.press("k")
    await expectOpenEntryAmong(page, titles.slice(-3))
  })

  test("handles alternating j and k", async ({ page }) => {
    const titles = await listedTitles(page)

    await page.keyboard.press("j")
    await page.keyboard.press("k")
    await page.keyboard.press("j")
    await page.keyboard.press("k")
    // j from nothing opens the first row and k from nothing the last, so every
    // interleaving of these four presses with their fetches stays within two
    // rows of one end or the other.
    await expectOpenEntryAmong(page, [...titles.slice(0, 2), ...titles.slice(-2)])
  })
})

test.describe("Content Scrolling (Ctrl+F/B)", () => {
  /**
   * A body several screens long. The seeded articles are two short paragraphs
   * that fit the reading pane, where a paging key has nothing to move.
   */
  const LONG_ARTICLE_HTML = Array.from(
    { length: 40 },
    (_, index) =>
      `<p>Paragraph ${index + 1} of an article long enough that the reading ` +
      `pane has to scroll to show all of it.</p>`
  ).join("\n")

  /** The article pane's own scroll viewport; the sidebar and the list have theirs. */
  const articleScrollTop = (page: Page) => () =>
    page
      .locator("[data-slot='scroll-area-viewport']:has(article)")
      .evaluate((element) => element.scrollTop)

  test.beforeEach(async ({ page }) => {
    // The body travels on the detail response only, so that is the one to
    // lengthen.
    await page.route(/\/api\/v1\/entries\/\d+$/, async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        response,
        json: { ...(await response.json()), content: LONG_ARTICLE_HTML },
      })
    })
    await waitForAppReady(page)
  })

  async function openLongArticle(page: Page) {
    const titles = await listedTitles(page)
    await page.keyboard.press("j")
    await expectEntryOpen(page, titles[0])
    await expect(page.getByRole("article")).toContainText("Paragraph 40")
    await expect.poll(articleScrollTop(page)).toBe(0)
  }

  test("Ctrl+F scrolls content down", async ({ page }) => {
    await openLongArticle(page)

    await page.keyboard.press("Control+f")
    await expect.poll(articleScrollTop(page)).toBeGreaterThan(0)
  })

  test("Ctrl+B scrolls content up", async ({ page }) => {
    await openLongArticle(page)
    await page.keyboard.press("Control+f")
    await expect.poll(articleScrollTop(page)).toBeGreaterThan(0)

    await page.keyboard.press("Control+b")
    await expect.poll(articleScrollTop(page)).toBe(0)
  })
})
