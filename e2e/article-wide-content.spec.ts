import { test, expect, type Page } from "./fixtures"

/**
 * Content wider than the reading pane must be reachable, not clipped (ttrb-qgjc).
 *
 * Radix wraps a ScrollArea.Viewport's children in a div it styles inline as
 * `min-width: 100%; display: table` (@radix-ui/react-scroll-area 1.2.18,
 * dist/index.mjs:125), and gives the viewport `overflow-x: hidden` whenever no
 * horizontal scrollbar is mounted (same file, line 121). The article pane
 * mounted only a vertical one, so a table or a pre block wider than the pane
 * laid out at its full width and then sat in a region the reader could not
 * reach by any gesture: not the wheel, not a trackpad swipe, not dragging, not
 * `scrollLeft`.
 *
 * This is the opposite of the sidebar's fix for the same Radix mechanism
 * (ttrb-rdnc, commit 0b5c261). There the wrapper was forced to `display: block`
 * so `truncate` would engage on row titles. Here content-width sizing is what
 * is wanted - a wide table should stay a wide table - so the fix mounts the
 * missing horizontal scrollbar and the overflow becomes scrollable.
 *
 * Every claim below reads geometry or scroll state out of a real browser. The
 * component suite cannot see any of it: happy-dom loads no stylesheet, so
 * nothing is laid out, every box measures zero and every element answers every
 * query regardless of what CSS would have done to it. The one thing that suite
 * can check is the viewport's inline `overflow-x`, which is a deletion guard
 * and is in EntryContent.test.tsx.
 */

/**
 * An article body whose table and pre block are both far wider than any pane
 * this suite renders. The cells are single unbroken tokens on purpose: a cell
 * of ordinary prose wraps, and a table that wraps is a table that fits.
 */
const WIDE_TABLE_COLUMNS = 12
const WIDE_ARTICLE_HTML = `
  <p>An ordinary paragraph, so the pane has something that fits above the part that does not.</p>
  <table>
    <thead>
      <tr>${Array.from(
        { length: WIDE_TABLE_COLUMNS },
        (_, column) => `<th>Quarterly-column-heading-${column}</th>`
      ).join("")}</tr>
    </thead>
    <tbody>
      <tr>${Array.from(
        { length: WIDE_TABLE_COLUMNS },
        (_, column) => `<td>measurement-value-000${column}00000</td>`
      ).join("")}</tr>
      <tr>${Array.from(
        { length: WIDE_TABLE_COLUMNS },
        (_, column) => `<td>measurement-value-111${column}11111</td>`
      ).join("")}</tr>
    </tbody>
  </table>
  <pre><code>const aLineOfCodeThatNeverWraps = "because a pre block preserves its whitespace and this line is long enough to prove it";</code></pre>
  <p><a href="https://example.invalid/an-unbreakable-url">https://example.invalid/a/very/long/unbreakable/url/that/no/pane/is/wide/enough/to/hold/on/one/line</a></p>
`

/**
 * Rewrites the body of whichever article gets opened, leaving every other field
 * the server produced alone.
 *
 * Interception rather than a row in E2eDataset: the fixture's entry counts are
 * asserted on by a dozen other specs, and a wide-table article is only ever
 * wanted here. GET /api/v1/entries/:id is the request that carries `content`
 * (the list endpoint sends `content_preview` instead), so this is the only
 * route that needs answering.
 */
async function serveWideArticle(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/entries\/\d+$/, async (route) => {
    const response = await route.fetch()
    const entry = (await response.json()) as Record<string, unknown>

    await route.fulfill({
      response,
      json: { ...entry, content: WIDE_ARTICLE_HTML },
    })
  })
}

/** The article pane's own scroll viewport; the sidebar and the list have theirs. */
const articleViewport = (page: Page) =>
  page.locator("[data-slot='scroll-area-viewport']:has(article)")

/**
 * Opens the first article by clicking it, then waits for the header, which is
 * the article pane's first painted element.
 */
async function openFirstEntry(page: Page): Promise<void> {
  const rows = page.getByRole("listbox", { name: "Entries" }).getByRole("option")
  await expect(rows.first()).toBeVisible()

  await rows.first().click()
  await expect(page.getByTestId("entry-header")).toBeVisible()
}

type ScrollMetrics = {
  clientWidth: number
  scrollWidth: number
  maxScrollLeft: number
  scrollLeft: number
  overflowX: string
}

async function measureHorizontalScroll(page: Page): Promise<ScrollMetrics> {
  return articleViewport(page).evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    maxScrollLeft: element.scrollWidth - element.clientWidth,
    scrollLeft: element.scrollLeft,
    overflowX: getComputedStyle(element).overflowX,
  }))
}

/**
 * Scrolls the pane sideways the way a reader would, and answers with how far it
 * got.
 *
 * A gesture rather than an assignment to `scrollLeft`, which would prove
 * nothing: `overflow-x: hidden` makes a box unscrollable *by the user* while
 * leaving it perfectly scrollable from script, so setting `scrollLeft` reaches
 * the far column on the broken pane too. Only the wheel can tell the two apart.
 *
 * The cursor is parked over the table's first header cell. A table is not a
 * scroll container, so the wheel propagates up to whichever ancestor will take
 * it; the pre block would have swallowed it, since prose styling gives it
 * `overflow-x: auto` of its own.
 */
async function wheelRight(page: Page, deltaX: number): Promise<void> {
  await articleViewport(page).locator("th").first().hover()
  await page.mouse.wheel(deltaX, 0)
}

/** `scrollLeft` as a poller, since the wheel settles asynchronously. */
const scrollLeftOf = (page: Page) => () =>
  articleViewport(page).evaluate((element) => element.scrollLeft)

/**
 * A poller that wheels once per attempt and reports where the pane got to.
 *
 * Repeated because Firefox caps how far one wheel event may carry a scroller,
 * so a single overshooting delta stops short of the end (702 of 854 pixels on
 * this fixture) while Chromium applies the whole thing. Neither engine moves it
 * at all before the fix, which is what the assertion is really about.
 */
const wheelingScrollLeft = (page: Page, step: number) => async () => {
  await page.mouse.wheel(step, 0)
  return scrollLeftOf(page)()
}

test.describe("An article wider than the reading pane", () => {
  test.beforeEach(async ({ page }) => {
    await serveWideArticle(page)

    await page.goto("/")
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
    await openFirstEntry(page)
  })

  /**
   * The guard the three examples below lean on. If the injected table ever
   * stops being wider than the pane - a narrower fixture, a wider default
   * viewport, a prose rule that makes tables wrap - they would all still pass
   * while proving nothing, and this is what would say so first.
   */
  test("the fixture really does overflow the pane", async ({ page }) => {
    const table = articleViewport(page).locator("table")
    await expect(table).toBeVisible()

    const widths = await articleViewport(page).evaluate((element) => ({
      pane: element.clientWidth,
      table: element.querySelector("table")?.getBoundingClientRect().width ?? 0,
    }))

    expect(widths.pane).toBeGreaterThan(0)
    expect(widths.table).toBeGreaterThan(widths.pane)
  })

  /**
   * The mechanism, stated directly. `overflow-x: hidden` is what Radix gives a
   * viewport with no horizontal scrollbar mounted, and it is the whole defect:
   * the box still holds the overflow and still answers `scrollLeft` from
   * script, it just refuses every gesture the reader has.
   */
  test("the pane is a horizontal scroll container, not a clipping box", async ({
    page,
  }) => {
    const metrics = await measureHorizontalScroll(page)

    expect(metrics.clientWidth).toBeGreaterThan(0)
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth)
    expect(metrics.overflowX).not.toBe("hidden")
  })

  /**
   * The catcher, in the reader's own terms. Against the unfixed pane the wheel
   * does nothing at all and `scrollLeft` sits at 0 forever.
   *
   * Note what does NOT work as a probe here: assigning `scrollLeft` reaches the
   * far column on the broken pane too, because `overflow: hidden` blocks the
   * user and not the script. Four earlier versions of this example passed
   * against the bug for exactly that reason.
   */
  test("a wheel gesture reaches the hidden columns", async ({ page }) => {
    expect(await scrollLeftOf(page)()).toBe(0)

    await wheelRight(page, 240)

    await expect.poll(scrollLeftOf(page)).toBeGreaterThan(0)
  })

  /**
   * The last column has to end up on screen, not merely be addressable by an
   * offset, and it has to get there by gesture.
   */
  test("the table's far edge lands inside the pane once scrolled", async ({
    page,
  }) => {
    const table = articleViewport(page).locator("table")
    await expect(table).toBeVisible()

    const { maxScrollLeft } = await measureHorizontalScroll(page)
    expect(maxScrollLeft).toBeGreaterThan(0)

    await articleViewport(page).locator("th").first().hover()
    await expect
      .poll(wheelingScrollLeft(page, 400))
      .toBeGreaterThanOrEqual(Math.floor(maxScrollLeft))

    const paneBox = await articleViewport(page).boundingBox()
    const tableBox = await table.boundingBox()
    if (!paneBox || !tableBox) throw new Error("pane and table must both lay out")

    // One pixel of slack for sub-pixel layout; the unfixed pane misses this by
    // the whole width of the hidden region, not by a rounding error.
    expect(tableBox.x + tableBox.width).toBeLessThanOrEqual(
      paneBox.x + paneBox.width + 1
    )
  })

  /**
   * Radix's default `type="hover"` is what this pane keeps, so the horizontal
   * bar is mounted (which is what makes the viewport scrollable at all) but its
   * thumb is only painted while the pointer is over the pane and the content
   * actually overflows. A bar standing under every article would be a
   * regression of its own; the example below is the other half of that claim.
   */
  test("hovering a wide article reveals the horizontal scrollbar", async ({
    page,
  }) => {
    const bar = page.locator(
      "[data-slot='scroll-area-scrollbar'][data-orientation='horizontal']"
    )

    await articleViewport(page).hover()

    await expect(bar).toBeVisible()
  })
})

test.describe("An article that fits the reading pane", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
    await openFirstEntry(page)
  })

  /**
   * Mounting a horizontal scrollbar switches the viewport from
   * `overflow-x: hidden` to `overflow-x: scroll`, and a scroll container that
   * reports width it does not have is its own bug. The seeded articles are two
   * paragraphs of prose, so there must be nothing to scroll sideways.
   */
  test("gains no horizontal overflow from the fix", async ({ page }) => {
    const metrics = await measureHorizontalScroll(page)

    expect(metrics.clientWidth).toBeGreaterThan(0)
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)
    expect(metrics.maxScrollLeft).toBeLessThanOrEqual(0)
  })

  /** No thumb under an article that fits, hover or no hover. */
  test("shows no horizontal scrollbar on hover", async ({ page }) => {
    const bar = page.locator(
      "[data-slot='scroll-area-scrollbar'][data-orientation='horizontal']"
    )

    await articleViewport(page).hover()

    await expect(bar).toHaveCount(0)
  })
})
