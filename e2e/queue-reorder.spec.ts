import { test, expect, stubTtsAudio, type Locator, type Page } from "./fixtures"

/**
 * Reordering the listening queue at phone width, by pointer and by keyboard.
 *
 * Each sortable row carries the list's `space-y-1` margin itself, with no
 * wrapper around it, so the pointer example is also the check that dnd-kit
 * still measures and swaps rows laid out that way at 320px.
 *
 * Neither example lets go until dnd-kit's live region says the row is over its
 * target. The drop resolves against the last committed collision, so letting
 * go any sooner can put the row back where it started.
 *
 * The queue is kept in localStorage rather than on the server, so that is
 * where the new order is read back from.
 */

const QUEUE_STORAGE_KEY = "nibbler:audioQueue"

type StoredQueueItem = { id: string; entryTitle: string }

const queueRows = (page: Page) => page.getByTestId("queue-item")

const gripOf = (page: Page, item: StoredQueueItem) =>
  page.getByRole("button", { name: `Move ${item.entryTitle}`, exact: true })

async function storedQueue(page: Page): Promise<StoredQueueItem[]> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "[]") as StoredQueueItem[],
    QUEUE_STORAGE_KEY
  )
}

const titlesOf = (items: StoredQueueItem[]) => items.map((item) => item.entryTitle)

/** The live region while a row of the three-article queue is over a position. */
const announcedOver = (page: Page, item: StoredQueueItem, position: number) =>
  page.getByText(`${item.entryTitle} moved to position ${position} of 3.`, { exact: true })

async function centreOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error("expected the drag handle to be laid out")
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * Listens to the first article, which plays it, then adds the next two with
 * "Add to queue". Returns the queue as the app stored it.
 */
async function queueThreeArticles(page: Page): Promise<StoredQueueItem[]> {
  const entryRows = page.getByRole("listbox", { name: "Entries" }).getByRole("option")
  const heading = page.getByRole("heading", { level: 1 })

  await expect(entryRows.first()).toBeVisible()
  await entryRows.first().click()
  await expect(page.getByTestId("entry-header")).toBeVisible()
  await page.getByRole("button", { name: "Listen" }).click()
  await expect(page.getByTestId("audio-panel")).toBeVisible()

  for (let added = 0; added < 2; added++) {
    const current = await heading.textContent()
    expect(current, "expected the open article to have a title").toBeTruthy()

    await page.getByRole("button", { name: "Next entry" }).click()
    // "Add to queue" is drawn on every article but the one playing, so until
    // the next article renders, the button on screen is the previous one's.
    await expect(heading).not.toHaveText(current!)
    await page.getByRole("button", { name: "Add to queue" }).click()
  }

  await expect.poll(async () => (await storedQueue(page)).length).toBe(3)
  const queued = await storedQueue(page)
  expect(new Set(titlesOf(queued)).size, "expected three different articles").toBe(3)
  return queued
}

async function expectRowsInOrder(page: Page, items: StoredQueueItem[]) {
  await expect(queueRows(page)).toHaveCount(items.length)
  await expect(queueRows(page)).toContainText(titlesOf(items))
}

/**
 * The provider writes back whatever queue it restores on load, so reading it
 * again after a reload shows the order survived a fresh mount too.
 */
async function expectStoredInOrder(page: Page, items: StoredQueueItem[]) {
  await expect.poll(async () => titlesOf(await storedQueue(page))).toEqual(titlesOf(items))

  await page.reload()
  await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
  await expect.poll(async () => titlesOf(await storedQueue(page))).toEqual(titlesOf(items))
}

test.describe("Reordering the queue on a 320px phone", () => {
  test.use({ viewport: { width: 320, height: 720 } })

  let queued: StoredQueueItem[]

  test.beforeEach(async ({ page }) => {
    await stubTtsAudio(page)
    await page.goto("/")
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
    queued = await queueThreeArticles(page)

    await page.getByRole("button", { name: "Open queue" }).click()
    await expectRowsInOrder(page, queued)
  })

  test("dragging the last row's grip over the row above swaps the two", async ({ page }) => {
    const [playing, second, last] = queued
    const grip = gripOf(page, last)
    const from = await centreOf(grip)
    const to = await centreOf(gripOf(page, second))

    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    // In steps, and past the sensor's 8px activation distance before heading
    // for the target: dnd-kit follows pointermove events, not where the
    // pointer ends up.
    await page.mouse.move(from.x, from.y - 12, { steps: 4 })
    await expect(grip).toHaveAttribute("aria-pressed", "true")
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await expect(announcedOver(page, last, 2)).toBeAttached()
    await page.mouse.up()

    await expectRowsInOrder(page, [playing, last, second])
    await expectStoredInOrder(page, [playing, last, second])
  })

  test("a row picked up with Space moves down with the arrow key", async ({ page }) => {
    const [playing, second, last] = queued
    const grip = gripOf(page, second)
    const heading = page.getByRole("heading", { level: 1 })
    const reading = await heading.textContent()
    expect(reading, "expected the open article to have a title").toBeTruthy()

    await grip.focus()
    await page.keyboard.press("Space")
    await expect(grip).toHaveAttribute("aria-pressed", "true")
    // The sensor starts listening for arrow keys a task after the pickup, and
    // drops any pressed in between. Over the last row, a further ArrowDown has
    // nowhere to go and does nothing, which is what makes pressing again safe.
    await expect(async () => {
      await page.keyboard.press("ArrowDown")
      await expect(announcedOver(page, second, 3)).toBeAttached({ timeout: 1000 })
    }).toPass({ timeout: 5000 })
    await page.keyboard.press("Space")
    await expect(
      page.getByText(`Dropped ${second.entryTitle} at position 3 of 3.`, { exact: true })
    ).toBeAttached()

    await expectRowsInOrder(page, [playing, last, second])
    // Space is also the page's "Page down, then next unread", which must not
    // see the presses on the grip.
    await expect(heading).toHaveText(reading!)
    await expectStoredInOrder(page, [playing, last, second])
  })
})
