import { test, expect, type Locator, type Page } from "./fixtures"

/**
 * The Subscribe dialog's category select on a phone, with category titles
 * longer than the screen has room for.
 *
 * The indent ceiling stopped nesting from widening the list, which left title
 * width. The list sized to its widest option with nothing bounding it by the
 * screen, and the trigger's nowrap text set its min-content width, which the
 * dialog's grid track then grew to, so choosing a long title pushed the whole
 * form off the right edge. The chosen title also came into the trigger behind
 * its option's indent.
 *
 * The long options wrap rather than truncate: sibling titles here differ only
 * in their last word, which is the part an ellipsis would take. A wrapped
 * option keeps its indent on every line, or its second line would sit at a
 * shallower depth than its first.
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

/**
 * The rendered lines of the first text inside `locator`, one box per line.
 *
 * Reads the text node rather than its element, so padding in front of the
 * glyphs is not counted as text.
 */
async function textLines(locator: Locator): Promise<Box[]> {
  return locator.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node && !node.textContent?.trim()) node = walker.nextNode()
    if (!node) return []

    const range = document.createRange()
    range.selectNodeContents(node)
    const byTop = new Map<number, { left: number; right: number }>()
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width === 0) continue
      const top = Math.round(rect.top)
      const line = byTop.get(top)
      byTop.set(
        top,
        line
          ? { left: Math.min(line.left, rect.left), right: Math.max(line.right, rect.right) }
          : { left: rect.left, right: rect.right }
      )
    }
    return Array.from(byTop.entries())
      .sort(([a], [b]) => a - b)
      .map(([, line]) => line)
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

    test("a long option shows its whole title inside the list, every line at its indent", async ({
      page,
    }) => {
      const list = await openCategoryList(page, dialog)
      const listBox = await boxOf(list)
      const optionBox = await boxOf(deepOption(page))
      const lines = await textLines(deepOption(page))

      // The title is wider than any of these screens can fit on one line, so
      // the per-line checks below are not vacuous.
      expect(lines.length, "lines the depth-10 title renders on").toBeGreaterThan(1)

      const textRight = Math.max(...lines.map((line) => line.right))
      expect(textRight, "title right edge against the list's").toBeLessThanOrEqual(
        listBox.right + SLACK
      )
      expect(textRight, `title right edge in a ${width}px viewport`).toBeLessThanOrEqual(
        width + SLACK
      )

      const indent = lines[0].left - optionBox.left
      expect(indent, "the depth-10 option is indented").toBeGreaterThan(0)
      for (const [index, line] of lines.entries()) {
        expect(line.left - optionBox.left, `indent of line ${index + 1}`).toBeCloseTo(indent, 0)
      }
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

    test("a chosen nested title starts at the trigger's padding, not behind its indent", async ({
      page,
    }) => {
      const list = await openCategoryList(page, dialog)
      await deepOption(page).click()
      await expect(list).toBeHidden()

      const trigger = categoryTrigger(dialog)
      const paddingLeft = await trigger.evaluate((element) =>
        parseFloat(getComputedStyle(element).paddingLeft)
      )
      const triggerBox = await boxOf(trigger)
      const lines = await textLines(trigger)
      expect(lines.length, "the trigger renders the chosen title").toBeGreaterThan(0)

      expect(lines[0].left - triggerBox.left, "inset of the chosen title").toBeLessThanOrEqual(
        paddingLeft + SLACK
      )
    })
  })
}
