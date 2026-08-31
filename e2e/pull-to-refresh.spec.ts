import { test, expect, type Page } from "./fixtures"
import type { CDPSession } from "@playwright/test"

/**
 * The touch gesture that reloads the entry list, exercised against the real
 * markup rather than a harness.
 *
 * Trusted touch events, dispatched over CDP rather than through
 * `dispatchEvent`. It matters: an untrusted TouchEvent runs the app's handlers
 * but the browser ignores its preventDefault, so a synthetic gesture cannot
 * tell a pull that holds the list still from one that scrolls it anyway. Every
 * assertion below about scrolling depends on the events being real.
 *
 * The arrangement being tested is the one that usually breaks a pull-to-refresh
 * (ttrb-yscf): `html` and `body` are `overflow: hidden`, so the document never
 * scrolls, and the list is a Radix ScrollArea viewport nested several levels
 * down. The gesture has to key off that viewport's scroll position, not the
 * document's.
 */

/** Where the entry rows are, in the mobile layout's single visible pane. */
const LIST_X = 180

async function touchDrag(
  cdp: CDPSession,
  { fromY, toY, steps = 12 }: { fromY: number; toY: number; steps?: number }
) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: LIST_X, y: fromY, id: 1 }],
  })
  for (let step = 1; step <= steps; step++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: LIST_X, y: fromY + ((toY - fromY) * step) / steps, id: 1 }],
    })
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}

declare global {
  interface Window {
    __entryListViewport?: HTMLElement
  }
}

/**
 * Pins the Radix viewport that scrolls the entry rows, found once while the
 * rows are on screen. It has to be held rather than re-queried: a refresh puts
 * the list into its loading state, which takes the rows away, and every
 * landmark that names the entry list is inside them. The viewport element
 * itself outlives that swap, which the `isConnected` check below insists on -
 * reading scrollTop off a detached node would answer 0 and pass everything.
 */
async function pinViewport(page: Page) {
  await page.evaluate(() => {
    const rows = document.querySelector('[role="listbox"][aria-label="Entries"]')
    const viewport = rows?.closest('[data-slot="scroll-area-viewport"]')
    if (!viewport) throw new Error("no entry-list viewport on the page")
    window.__entryListViewport = viewport as HTMLElement
  })
}

function viewportScrollTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const viewport = window.__entryListViewport
    if (!viewport?.isConnected) {
      throw new Error("the entry-list viewport was replaced mid-test")
    }
    return viewport.scrollTop
  })
}

async function scrollListTo(page: Page, top: number) {
  await page.evaluate((to) => {
    const viewport = window.__entryListViewport
    if (!viewport?.isConnected) {
      throw new Error("the entry-list viewport was replaced mid-test")
    }
    viewport.scrollTop = to
  }, top)
}

test.describe("pull to refresh", () => {
  // A touch-capable mobile viewport. `isMobile` is Chromium-only in Playwright,
  // and the gesture is dispatched over CDP, which Firefox has no equivalent
  // for, so this file is one engine's job.
  test.skip(({ browserName }) => browserName !== "chromium", "needs CDP touch injection")
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  let cdp: CDPSession

  test.beforeEach(async ({ feedsPage: _feedsPage, page }) => {
    // The mobile layout opens on the list pane showing every feed, so there is
    // nothing to select: the sidebar is a drawer and is not on screen.
    await expect(page.getByRole("listbox", { name: "Entries" })).toBeVisible()
    await pinViewport(page)

    // Held open so the refresh is still in flight while the assertions run. The
    // indicator is the only visible report the reader gets, and without this it
    // is gone before Playwright can look at it. Registered after the first load
    // so it delays the reload under test and not the setup.
    await page.route("**/api/v1/entries?**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
      await route.continue()
    })

    cdp = await page.context().newCDPSession(page)
  })

  /**
   * This is also where preventDefault is proved load-bearing. Deleting the
   * `e.preventDefault()` from usePullToRefresh fails this test and only this
   * test: Chromium takes the sequence as a scroll, stops making the moves
   * cancelable, and the hook hands the gesture back. The scroll-position test
   * below stays green through that mutation, because at the top of the list
   * there is nowhere to scroll to either way.
   */
  test("pulling down at the top of the list refreshes it", async ({ page }) => {
    await touchDrag(cdp, { fromY: 300, toY: 620 })

    // The gesture's only report to the reader, and the point at which it
    // becomes a live region: `getByRole` alone would also match the drag-and-drop
    // library's own announcer, which is on the page throughout.
    await expect(page.getByTestId("pull-to-refresh")).toHaveText("Refreshing")
    await expect(page.getByRole("status").filter({ hasText: "Refreshing" })).toBeVisible()
    await expect(page.getByTestId("pull-to-refresh")).toBeHidden()
    await expect(page.getByRole("listbox", { name: "Entries" })).toBeVisible()
  })

  test("the pull moves the indicator and not the list", async ({ page }) => {
    await touchDrag(cdp, { fromY: 300, toY: 620 })

    expect(await viewportScrollTop(page)).toBe(0)
  })

  test("swiping up from the top scrolls the list and offers no refresh", async ({ page }) => {
    await touchDrag(cdp, { fromY: 620, toY: 300 })

    expect(await viewportScrollTop(page)).toBeGreaterThan(0)
    await expect(page.getByTestId("pull-to-refresh")).toBeHidden()
  })

  test("pulling down partway through the list does not refresh", async ({ page }) => {
    await scrollListTo(page, 400)
    expect(await viewportScrollTop(page)).toBeGreaterThan(0)

    await touchDrag(cdp, { fromY: 300, toY: 620 })

    await expect(page.getByTestId("pull-to-refresh")).toBeHidden()
  })

  test("a pull too short to count leaves the list alone", async ({ page }) => {
    await touchDrag(cdp, { fromY: 300, toY: 340, steps: 4 })

    await expect(page.getByTestId("pull-to-refresh")).toBeHidden()
    expect(await viewportScrollTop(page)).toBe(0)
  })
})
