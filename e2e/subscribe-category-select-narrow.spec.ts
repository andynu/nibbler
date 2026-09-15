import { test, expect, type Locator, type Page } from "./fixtures"

/**
 * The Subscribe dialog's category select on a phone, with category titles
 * longer than the screen has room for.
 *
 * The indent ceiling stopped nesting from widening the list, which left title
 * width. The list sized to its widest option with nothing bounding it by the
 * screen, and the trigger's nowrap text set its min-content width, which the
 * dialog's grid track then grew to, so choosing a long title pushed the whole
 * form off the right edge.
 *
 * Why a browser spec: vitest runs on happy-dom, which loads no stylesheet and
 * lays nothing out, so none of these boxes exist there. `toBeVisible()` passes
 * for a list hanging off the edge of the screen, so every example reads
 * geometry.
 */

/** Levels added below the seeded root, so the deepest category is at depth 10. */
const EXTRA_LEVELS = 10
const DEEP_TITLE = `Byzantine Fault Tolerance Working Group ${EXTRA_LEVELS}`

/** Sub-pixel slack for layout rounding; the unfixed select misses by tens of pixels. */
const SLACK = 1

const PHONE_WIDTHS = [320, 360, 375] as const

/**
 * Extends the seeded Technology category into a chain 10 levels deep.
 *
 * Built through the API rather than added to E2eDataset, so no other spec's
 * counts move.
 */
async function buildDeepChain(page: Page): Promise<void> {
  const response = await page.request.get("/api/v1/categories")
  expect(response.ok()).toBe(true)
  const categories = (await response.json()) as Array<{ id: number; title: string }>
  const technology = categories.find((category) => category.title === "Technology")
  if (!technology) {
    throw new Error(`E2eDataset should seed a "Technology" root category`)
  }

  let parentId = technology.id
  for (let level = 1; level <= EXTRA_LEVELS; level++) {
    const created = await page.request.post("/api/v1/categories", {
      data: { title: `Byzantine Fault Tolerance Working Group ${level}`, parent_id: parentId },
    })
    expect(created.ok()).toBe(true)
    parentId = ((await created.json()) as { id: number }).id
  }
}

/** Resolves once the element's own enter or exit animation has run. */
async function settled(locator: Locator): Promise<void> {
  await locator.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished))
  )
}

/**
 * Opens the dialog through its `?subscribe=` entry point, which a phone
 * reaches the same dialog by without going through the sidebar pane.
 */
async function openSubscribeDialog(page: Page): Promise<Locator> {
  await page.goto("/?subscribe=https%3A%2F%2Fexample.com%2Ffeed.xml")
  const dialog = page.getByRole("dialog", { name: "Subscribe to Feed" })
  await expect(dialog).toBeVisible({ timeout: 10000 })
  await settled(dialog)
  return dialog
}

const categoryList = (page: Page) =>
  page
    .getByRole("listbox")
    .filter({ has: page.getByRole("option", { name: "No category", exact: true }) })

const deepOption = (page: Page) => page.getByRole("option", { name: DEEP_TITLE, exact: true })

/** The dialog holds one select, and its trigger carries no accessible name. */
const categoryTrigger = (dialog: Locator) => dialog.getByRole("combobox")

async function openCategoryList(page: Page, dialog: Locator): Promise<Locator> {
  await categoryTrigger(dialog).click()
  const list = categoryList(page)
  await expect(list).toBeVisible()
  // The chain arrives with the categories request, which can land after the
  // dialog opens.
  await expect(deepOption(page)).toBeAttached()
  await settled(list)
  return list
}

type Box = { left: number; right: number }

async function boxOf(locator: Locator): Promise<Box> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, right: rect.right }
  })
}

for (const width of PHONE_WIDTHS) {
  test.describe(`The Subscribe dialog's category select at ${width}px`, () => {
    test.use({ viewport: { width, height: 720 } })

    let dialog: Locator

    test.beforeEach(async ({ page }) => {
      await buildDeepChain(page)
      dialog = await openSubscribeDialog(page)
    })

    test("the open list stays on the screen", async ({ page }) => {
      const list = await boxOf(await openCategoryList(page, dialog))

      expect(list.left, "list left edge").toBeGreaterThanOrEqual(-SLACK)
      expect(list.right, `list right edge in a ${width}px viewport`).toBeLessThanOrEqual(
        width + SLACK
      )
    })

    test("choosing a long title keeps the trigger and the dialog on the screen", async ({
      page,
    }) => {
      const list = await openCategoryList(page, dialog)
      await deepOption(page).click()
      await expect(list).toBeHidden()

      const trigger = categoryTrigger(dialog)
      await expect(trigger).toContainText("Byzantine Fault Tolerance")

      const triggerBox = await boxOf(trigger)
      const dialogMetrics = await dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return {
          contentRight: rect.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        }
      })

      expect(triggerBox.right, `trigger right edge in a ${width}px viewport`).toBeLessThanOrEqual(
        width + SLACK
      )
      expect(triggerBox.right, "trigger right edge against the dialog's content box")
        .toBeLessThanOrEqual(dialogMetrics.contentRight + SLACK)
      expect(dialogMetrics.scrollWidth, "dialog scrollWidth against clientWidth").toBeLessThanOrEqual(
        dialogMetrics.clientWidth
      )
    })
  })
}
