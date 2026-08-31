import { test, expect, type Page } from "./fixtures"

/**
 * The sidebar's count badges must stay on screen at every tree depth (ttrb-rdnc).
 *
 * Radix wraps a ScrollArea.Viewport's children in a div it styles inline as
 * `min-width: 100%; display: table` (@radix-ui/react-scroll-area 1.2.18,
 * dist/index.mjs). A CSS table sizes to its content, so that wrapper grows past
 * the sidebar rather than bounding what is inside it: measured at 710px inside
 * a 239px viewport with the fixture below. With no bounded ancestor the
 * `truncate` on a row's title has nothing to truncate against, so the title
 * takes its full width, the flex row grows with it, and the `shrink-0` badge
 * pinned at the row's end lands 418px past the sidebar's right edge. The
 * viewport is `overflow-x: hidden` whenever no horizontal scrollbar is mounted
 * and this one mounts only a vertical scrollbar, so that region is hidden
 * rather than reachable.
 *
 * Every assertion here reads geometry out of a real browser. The bug is
 * invisible to the two cheaper kinds of test: the row's class list was already
 * correct (min-w-0 / truncate / shrink-0), so no class-string assertion can see
 * it, and the component suite runs under happy-dom with no stylesheet loaded,
 * where nothing is laid out and every element answers getByRole regardless.
 */

/**
 * Titles long enough that no sane sidebar width fits them, so the row must
 * either truncate or overflow. Nothing distinguishes the two except geometry.
 */
const DEEP_CATEGORY_TITLES = [
  "Web Infrastructure and Platform Engineering",
  "Distributed Computing and Consensus Protocols",
  "Byzantine Fault Tolerance Working Group Notes",
]
const LONG_FEED_TITLE =
  "Distributed Consensus Quarterly: Proceedings of the Standing Committee"

type BuiltTree = {
  /** id of the deepest category, the one holding the renamed feed */
  deepestCategoryId: number
  /** id of the feed moved into it */
  feedId: number
  /** how many levels below a root category the feed's own row sits */
  feedDepth: number
  /** every category in the tree, for seeding the sidebar's expanded set */
  allCategoryIds: number[]
}

/**
 * Extends the seeded two-level tree (Technology > Programming) into a chain
 * deep enough to reproduce the report, and parks a long-titled feed with unread
 * entries at the bottom of it.
 *
 * Built through the API rather than added to E2eDataset, so the shape lives
 * with the examples that need it and no other spec's counts move.
 */
async function buildDeepTree(page: Page): Promise<BuiltTree> {
  const categoriesResponse = await page.request.get("/api/v1/categories")
  expect(categoriesResponse.ok()).toBe(true)
  const categories = (await categoriesResponse.json()) as Array<{
    id: number
    title: string
  }>

  const technology = categories.find((category) => category.title === "Technology")
  if (!technology) {
    throw new Error(
      `E2eDataset should seed a "Technology" root category; saw ${categories
        .map((category) => category.title)
        .join(", ")}`
    )
  }

  const allCategoryIds = categories.map((category) => category.id)
  let parentId = technology.id
  for (const title of DEEP_CATEGORY_TITLES) {
    const response = await page.request.post("/api/v1/categories", {
      data: { title, parent_id: parentId },
    })
    expect(response.ok()).toBe(true)
    const created = (await response.json()) as { id: number; parent_id: number }
    expect(created.parent_id).toBe(parentId)
    allCategoryIds.push(created.id)
    parentId = created.id
  }

  // Rust Weekly is seeded with unread entries, so its badge renders without
  // this spec having to manufacture unread state.
  const feedsResponse = await page.request.get("/api/v1/feeds")
  const feeds = (await feedsResponse.json()) as Array<{
    id: number
    title: string
    unread_count: number
  }>
  const feed = feeds.find((candidate) => candidate.title === "Rust Weekly")
  if (!feed) {
    throw new Error(
      `E2eDataset should seed a "Rust Weekly" feed; saw ${feeds
        .map((candidate) => candidate.title)
        .join(", ")}`
    )
  }
  expect(feed.unread_count).toBeGreaterThan(0)

  const updateResponse = await page.request.patch(`/api/v1/feeds/${feed.id}`, {
    data: { title: LONG_FEED_TITLE, category_id: parentId },
  })
  expect(updateResponse.ok()).toBe(true)

  return {
    deepestCategoryId: parentId,
    feedId: feed.id,
    // Technology is depth 0 and each title above adds one, so the deepest
    // category renders at depth 3 and its feeds one level in from that.
    feedDepth: DEEP_CATEGORY_TITLES.length + 1,
    allCategoryIds,
  }
}

/**
 * Loads the reader with the whole tree open, so the deep rows are painted.
 *
 * The expanded set comes from localStorage rather than from clicking "Expand
 * all categories": that handler expands whichever category ids the component
 * holds when it fires, which is none until the categories request resolves, so
 * clicking it raced the load and left the new categories collapsed. The
 * signedIn fixture seeds the same key with the ids that existed before
 * buildDeepTree ran, and this overwrites it with the full set.
 */
async function openTreeFully(page: Page, tree: BuiltTree): Promise<void> {
  await page.addInitScript((ids: number[]) => {
    window.localStorage.setItem("nibbler:expandedCategories", JSON.stringify(ids))
  }, tree.allCategoryIds)

  await page.goto("/")
  // app-root is server-rendered and visible before React mounts, so wait on the
  // sidebar landmark instead.
  await expect(page.getByRole("navigation", { name: "Feeds" })).toBeVisible({
    timeout: 10000,
  })
  // Nothing below can be measured until the deep row is painted, and it is the
  // last thing to arrive: it needs both the categories and the feeds request.
  await expect(page.locator(`[data-feed-id="${tree.feedId}"]`)).toBeVisible({
    timeout: 10000,
  })
}

test.describe("Sidebar count badges at depth", () => {
  let tree: BuiltTree

  test.beforeEach(async ({ page }) => {
    tree = await buildDeepTree(page)
    await openTreeFully(page, tree)
  })

  /**
   * Fails if the badge's right edge lands past the sidebar pane's right edge,
   * which is exactly what the report describes: the badge is still in the
   * document and still answers getByRole, but it sits in the pane's hidden
   * overflow. Removing the fix puts the badge's right edge at 657.7 against a
   * pane that ends at 240.
   */
  test("a deeply nested feed's badge stays inside the sidebar", async ({ page }) => {
    const sidebar = page.getByTestId("sidebar-pane")
    const row = page.locator(`[data-feed-id="${tree.feedId}"]`)
    const badge = row.locator('[data-slot="badge"]')

    await expect(row).toBeVisible()
    await expect(badge).toHaveText(/^\d+$/)

    const sidebarBox = await sidebar.boundingBox()
    const badgeBox = await badge.boundingBox()
    if (!sidebarBox || !badgeBox) throw new Error("sidebar and badge must both lay out")

    // The pane is the honest boundary: it is the element with overflow:hidden,
    // so anything past its right edge is clipped away from the reader.
    expect(sidebarBox.width).toBeGreaterThan(0)
    expect(badgeBox.width).toBeGreaterThan(0)
    expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(
      sidebarBox.x + sidebarBox.width
    )
    expect(badgeBox.x).toBeGreaterThanOrEqual(sidebarBox.x)
  })

  /**
   * Fails if the title renders at its full width instead of ellipsing. The
   * scrollWidth > clientWidth comparison is the only direct evidence that
   * `truncate` engaged: a class-string check passes either way, because the
   * class was never missing.
   */
  test("a long feed title truncates rather than widening its row", async ({ page }) => {
    const sidebar = page.getByTestId("sidebar-pane")
    const row = page.locator(`[data-feed-id="${tree.feedId}"]`)
    const title = row.getByText(LONG_FEED_TITLE, { exact: true })

    await expect(title).toBeVisible()

    const overflow = await title.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }))
    expect(overflow.clientWidth).toBeGreaterThan(0)
    expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth)

    const sidebarBox = await sidebar.boundingBox()
    const rowBox = await row.boundingBox()
    if (!sidebarBox || !rowBox) throw new Error("sidebar and row must both lay out")
    expect(rowBox.width).toBeLessThanOrEqual(sidebarBox.width)
  })

  /**
   * Fails if the Radix viewport wrapper still sizes to content. scrollWidth
   * exceeding clientWidth means there is a horizontal region the sidebar offers
   * no scrollbar for, which is the "hidden overflow" of the report.
   */
  test("the sidebar has no hidden horizontal overflow at depth", async ({ page }) => {
    // Scoped to the sidebar pane: the entry list and the article pane each
    // render their own ScrollArea, and this claim is only about this one.
    const viewport = page
      .getByTestId("sidebar-pane")
      .locator("[data-slot='scroll-area-viewport']")
    await expect(viewport).toBeVisible()

    const metrics = await viewport.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      wrapperDisplay: element.firstElementChild
        ? getComputedStyle(element.firstElementChild).display
        : null,
      wrapperWidth: element.firstElementChild
        ? (element.firstElementChild as HTMLElement).getBoundingClientRect().width
        : null,
    }))

    expect(metrics.clientWidth).toBeGreaterThan(0)
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)
    // The wrapper is Radix's own, not ours, so pin the property that matters:
    // it must not be wider than the viewport it lives in.
    expect(metrics.wrapperWidth).not.toBeNull()
    expect(metrics.wrapperWidth as number).toBeLessThanOrEqual(metrics.clientWidth + 1)
  })

  /**
   * The category rows are the ones in Andy's screenshot. Same failure mode as
   * the feed row and a separate render path (CategoryItem, not FeedItem), so it
   * gets its own example rather than riding on the feed's.
   */
  test("a deeply nested category's badge stays inside the sidebar", async ({ page }) => {
    const sidebar = page.getByTestId("sidebar-pane")
    const row = page.locator(`[data-category-id="${tree.deepestCategoryId}"]`)
    const badge = row.locator('[data-slot="badge"]').first()

    await expect(row).toBeVisible()
    await expect(badge).toHaveText(/^\d+$/)

    const sidebarBox = await sidebar.boundingBox()
    const badgeBox = await badge.boundingBox()
    if (!sidebarBox || !badgeBox) throw new Error("sidebar and badge must both lay out")

    expect(badgeBox.width).toBeGreaterThan(0)
    expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(
      sidebarBox.x + sidebarBox.width
    )
    expect(badgeBox.x).toBeGreaterThanOrEqual(sidebarBox.x)
  })

  /**
   * A guard, not a catcher: this passes against the unfixed code too, because
   * the indentation was never the broken part. What it protects is the four
   * examples above, which only mean anything while the fixture is genuinely
   * deep. Flatten the tree and they would all still pass while testing nothing;
   * this is what would say so.
   */
  test("the deep feed row is indented far enough to reproduce the report", async ({
    page,
  }) => {
    const row = page.locator(`[data-feed-id="${tree.feedId}"]`)
    await expect(row).toBeVisible()

    const indent = await row.evaluate(
      (element) => element.getBoundingClientRect().left
    )
    const sidebarBox = await page.getByTestId("sidebar-pane").boundingBox()
    if (!sidebarBox) throw new Error("sidebar must lay out")

    // depth * 16 + 8 per FeedSidebar's own indentation rule.
    expect(indent - sidebarBox.x).toBeGreaterThanOrEqual(tree.feedDepth * 16)
  })
})
