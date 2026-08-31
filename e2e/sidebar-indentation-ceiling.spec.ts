import { test, expect, type Page } from "./fixtures"

/**
 * Sidebar indentation has a ceiling, and deep rows stay legible (ttrb-ekdp).
 *
 * ttrb-rdnc (0b5c261) stopped the unread badges being pushed into the
 * sidebar's hidden overflow by bounding the Radix ScrollArea viewport wrapper.
 * That fix is correct and it is what makes `truncate` work at all, but its
 * guarantee was conditional on tree depth: rows were indented `depth * 16 + 8`
 * with no ceiling, so past a point the indent alone consumed the pane and the
 * badge went straight back out - not mis-allocated space this time, but no
 * space at all.
 *
 * Measured in Chromium at the narrowest width the tree ever renders at (a
 * 240px pane, 239px viewport, 223px of tree after `p-2`), per feed row:
 *
 *   indent  title  badge right edge
 *       24     62               187   fits
 *       72     14               187   fits
 *      120      0             220.9   badge has left its button and sits under
 *                                     the hover menu
 *      168      0             268.9   badge is 29px outside the 240px pane
 *
 * So the examples below drive the tree past that and assert the row still lays
 * out: the badge inside its own button, the title with width left, and the
 * indent no wider at depth 10 than it is at the ceiling.
 *
 * Every assertion here reads geometry out of a real browser. The component
 * suite can see the inline `padding-left` the component computed - happy-dom
 * keeps the style attribute - but not what it does, because happy-dom loads no
 * stylesheet and lays nothing out.
 */

/** Levels added below the seeded root, so the deepest category is at depth 10. */
const EXTRA_LEVELS = 10
/** Long enough that no sidebar width fits it, so the row must truncate. */
const LONG_FEED_TITLE =
  "Distributed Consensus Quarterly: Proceedings of the Standing Committee"
/** The ceiling FeedSidebar's MAX_INDENT_DEPTH sets, in levels below the root. */
const CEILING_DEPTH = 3

type BuiltTree = {
  /** Category ids by depth, index 0 being the seeded root. */
  categoryIdsByDepth: number[]
  /** The long-titled feed parked in the deepest category. */
  feedId: number
  /** Every category in the account, for seeding the expanded set. */
  allCategoryIds: number[]
}

/**
 * Extends the seeded tree into a chain 10 levels deep and parks a long-titled
 * feed with unread entries at the bottom of it.
 *
 * Built through the API rather than added to E2eDataset, so no other spec's
 * counts move - the same approach e2e/sidebar-badge-visibility.spec.ts takes.
 */
async function buildDeepChain(page: Page): Promise<BuiltTree> {
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
  const categoryIdsByDepth = [technology.id]
  let parentId = technology.id
  for (let level = 1; level <= EXTRA_LEVELS; level++) {
    const response = await page.request.post("/api/v1/categories", {
      data: { title: `Byzantine Fault Tolerance Working Group ${level}`, parent_id: parentId },
    })
    expect(response.ok()).toBe(true)
    const created = (await response.json()) as { id: number; parent_id: number }
    expect(created.parent_id).toBe(parentId)
    allCategoryIds.push(created.id)
    categoryIdsByDepth.push(created.id)
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

  return { categoryIdsByDepth, feedId: feed.id, allCategoryIds }
}

/**
 * Loads the reader with the whole chain open, so the deep rows are painted.
 *
 * The expanded set is seeded through localStorage rather than by clicking
 * "Expand all categories": that handler expands whichever ids the component
 * holds when it fires, which races the categories request.
 */
async function openChainFully(page: Page, tree: BuiltTree): Promise<void> {
  await page.addInitScript((ids: number[]) => {
    window.localStorage.setItem("nibbler:expandedCategories", JSON.stringify(ids))
  }, tree.allCategoryIds)

  await page.goto("/")
  await expect(page.getByRole("navigation", { name: "Feeds" })).toBeVisible({
    timeout: 10000,
  })
  await expect(page.locator(`[data-feed-id="${tree.feedId}"]`)).toBeAttached({
    timeout: 10000,
  })
}

/** Left inset of a row's own control, which is what the indent moves. */
async function indentOfCategory(page: Page, categoryId: number): Promise<number> {
  return page
    .locator(`[data-category-id="${categoryId}"] button`)
    .first()
    .evaluate((element) => parseFloat(getComputedStyle(element).paddingLeft))
}

test.describe("Sidebar indentation ceiling", () => {
  let tree: BuiltTree

  test.beforeEach(async ({ page }) => {
    tree = await buildDeepChain(page)
    await openChainFully(page, tree)
  })

  /**
   * The guard the other examples rest on. If the fixture stops being deep they
   * would all pass while testing nothing, and this is what would say so.
   * Passes against the unfixed code too, by design: the chain is what it is
   * regardless of how the rows are drawn.
   */
  test("the fixture really is deeper than the ceiling", async () => {
    expect(tree.categoryIdsByDepth).toHaveLength(EXTRA_LEVELS + 1)
    expect(EXTRA_LEVELS).toBeGreaterThan(CEILING_DEPTH)
  })

  /**
   * The direct statement of the ceiling. Against the unfixed code the depth-10
   * category sits at 168px against the depth-3 category's 56px.
   */
  test("indentation stops growing past the ceiling", async ({ page }) => {
    const atCeiling = await indentOfCategory(page, tree.categoryIdsByDepth[CEILING_DEPTH])
    const deepest = await indentOfCategory(
      page,
      tree.categoryIdsByDepth[tree.categoryIdsByDepth.length - 1]
    )

    // The levels above the ceiling still say where they are.
    const root = await indentOfCategory(page, tree.categoryIdsByDepth[0])
    expect(atCeiling).toBeGreaterThan(root)

    expect(deepest).toBe(atCeiling)
  })

  /**
   * The failure the ticket describes. Against the unfixed code the badge's
   * right edge lands about 45px past the pane, inside the overflow the
   * viewport hides, which is exactly the state ttrb-rdnc closed for shallow
   * trees.
   */
  test("a feed's badge stays inside the sidebar at depth", async ({ page }) => {
    const sidebar = page.getByTestId("sidebar-pane")
    const row = page.locator(`[data-feed-id="${tree.feedId}"]`)
    const badge = row.locator('[data-slot="badge"]')

    await expect(row).toBeVisible()
    await expect(badge).toHaveText(/^\d+$/)

    const sidebarBox = await sidebar.boundingBox()
    const badgeBox = await badge.boundingBox()
    if (!sidebarBox || !badgeBox) throw new Error("sidebar and badge must both lay out")

    expect(badgeBox.width).toBeGreaterThan(0)
    expect(badgeBox.x).toBeGreaterThanOrEqual(sidebarBox.x)
    expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(sidebarBox.x + sidebarBox.width)
  })

  /**
   * Stronger than "inside the pane", and the claim the ceiling was actually
   * measured from: the badge has not spilled out of the control it belongs to.
   * Once the indent exceeds what the row can pay for, the `shrink-0` badge
   * overflows its own button rightwards and comes to rest under the hover
   * menu - still inside the pane for a while, and already wrong.
   */
  test("a feed's badge stays inside its own row control at depth", async ({ page }) => {
    const row = page.locator(`[data-feed-id="${tree.feedId}"]`)
    const geometry = await row.evaluate((element) => {
      const button = element.querySelector("button") as HTMLElement
      const badge = element.querySelector('[data-slot="badge"]') as HTMLElement | null
      if (!badge) return null
      const buttonBox = button.getBoundingClientRect()
      const badgeBox = badge.getBoundingClientRect()
      return {
        buttonRight: buttonBox.right,
        buttonWidth: buttonBox.width,
        badgeRight: badgeBox.right,
      }
    })
    if (!geometry) throw new Error("the deep feed row must render a badge")

    expect(geometry.buttonWidth).toBeGreaterThan(0)
    // Sub-pixel slack only; the unfixed code overshoots by tens of pixels.
    expect(geometry.badgeRight).toBeLessThanOrEqual(geometry.buttonRight + 1)
  })

  /**
   * A row whose title has no width left shows an icon and a number and nothing
   * that identifies it. Against the unfixed code the deep feed's title is 0px
   * wide, so this is the legibility half of the same defect.
   */
  test("a deep feed's title keeps room to render something", async ({ page }) => {
    const row = page.locator(`[data-feed-id="${tree.feedId}"]`)
    const title = row.getByText(LONG_FEED_TITLE, { exact: true })

    const overflow = await title.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))

    expect(overflow.clientWidth).toBeGreaterThan(0)
    // Still ellipsing rather than widening the row, as ttrb-rdnc established.
    expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth)
  })

  /**
   * The whole row survives. At the depths the unfixed code reaches, the
   * indentation exceeds the tree's own width and the row's box collapses to
   * zero: the feed is in the document, answers getByRole, and occupies no
   * pixels at all.
   */
  test("a deep feed's row still occupies the sidebar", async ({ page }) => {
    const sidebar = page.getByTestId("sidebar-pane")
    const row = page.locator(`[data-feed-id="${tree.feedId}"]`)

    const sidebarBox = await sidebar.boundingBox()
    const rowBox = await row.boundingBox()
    if (!sidebarBox || !rowBox) throw new Error("sidebar and row must both lay out")

    expect(rowBox.width).toBeGreaterThan(0)
    expect(rowBox.width).toBeLessThanOrEqual(sidebarBox.width)
    expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(sidebarBox.x + sidebarBox.width + 1)
  })

  /**
   * ttrb-rdnc's claim, restated at a depth it was never tested at. The indent
   * is the other way the viewport acquires a horizontal region with no
   * scrollbar to reach it.
   */
  test("the sidebar has no hidden horizontal overflow at depth", async ({ page }) => {
    const viewport = page
      .getByTestId("sidebar-pane")
      .locator("[data-slot='scroll-area-viewport']")
    await expect(viewport).toBeVisible()

    const metrics = await viewport.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }))

    expect(metrics.clientWidth).toBeGreaterThan(0)
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)
  })

  /**
   * The cap is applied to the folder's depth and the feed's own step added
   * afterwards, so a feed never collapses onto the heading it hangs from. The
   * cheap way to write the cap - capping the feed's depth directly - would put
   * both at the same offset and lose the last cue that these rows are inside
   * that folder.
   */
  test("a deep feed still sits inboard of the folder holding it", async ({ page }) => {
    const deepestCategoryId = tree.categoryIdsByDepth[tree.categoryIdsByDepth.length - 1]
    const categoryIndent = await indentOfCategory(page, deepestCategoryId)

    const rowLeft = await page
      .locator(`[data-feed-id="${tree.feedId}"]`)
      .evaluate((element) => element.getBoundingClientRect().left)
    const categoryLeft = await page
      .locator(`[data-category-id="${deepestCategoryId}"]`)
      .evaluate((element) => element.getBoundingClientRect().left)

    // The category's text starts at its row's left plus the button padding;
    // the feed's row is itself pushed in by its margin.
    expect(rowLeft).toBeGreaterThan(categoryLeft)
    expect(rowLeft - categoryLeft).toBeGreaterThan(0)
    expect(categoryIndent).toBeGreaterThan(0)
  })
})
