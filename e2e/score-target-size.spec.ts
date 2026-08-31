import { test, expect, type Page } from "./fixtures"

/**
 * How big the score targets actually are, and where a near miss lands
 * (ttrb-w0w6).
 *
 * The five squares ScoreButtons draws are 24x24 CSS pixels. That is exactly
 * WCAG 2.5.8 Target Size (Minimum), the AA floor, and about half of the
 * practical guidance (Apple HIG 44pt, Material 48dp). Sitting on the floor is
 * not itself a violation, so the argument for widening the target is not the
 * standard - it is the shape of this particular control.
 *
 * The five sit edge to edge. A miss therefore does not land on nothing, the
 * way a miss on an isolated icon button does; it lands on the NEIGHBOURING
 * score and writes a wrong value to the article. There is no error state and
 * no undo prompt: the reader gets a 3 where they meant a 4 and the only tell
 * is the number itself. A silently wrong write is worth more margin than a
 * no-op, which is why 24px is treated as too small here and is fine elsewhere.
 *
 * Why the margin goes on one axis only. The article header has no horizontal
 * room to give: measured on the seeded first entry the action row is 450px
 * wide against a pane of 320 (at a 640px viewport) rising to 464 (at 1024),
 * so the row already overflows everywhere below about 1114px of viewport - see
 * ttrb-1zn8, filed separately, which is why the assertions here run at 1280
 * where all five squares are on screen. Widening the squares would add 60px to
 * a row that is already 90px over its pane at 1024, re-breaking what ttrb-h12t
 * and ttrb-s1xr had just fixed. Growing the hit area sideways instead of the
 * visual is worse still: adjacent expanded areas would overlap and a tap that
 * used to land on the score under the finger would start landing on its
 * neighbour, which is the failure this ticket is about.
 *
 * So the target grows vertically, out of flow, into the 6px of dead space the
 * 36px toolbar row already reserves above and below a 24px control and the
 * header's own padding beyond it. Layout is unchanged; only what answers a tap
 * changes.
 *
 * Why a browser spec. vitest runs on happy-dom, which loads no stylesheet and
 * lays nothing out, so every box there is zero by zero and a hit area is not
 * observable at all. Note also that boundingBox() reports the border box and
 * knows nothing about a pseudo-element that overflows it, and that Playwright
 * clicks an element's centre whatever its size - so neither a bounding box nor
 * an ordinary click can tell a 24px target from a 44px one. Both assertions
 * below therefore address a POINT: elementFromPoint for what would receive the
 * tap, and page.mouse.click at a deliberate offset from centre for what a near
 * miss actually does.
 */

/**
 * 1280 is the narrowest measured viewport where the whole action row is on
 * screen (at 1024 the row runs 664..1114 against 1024 of viewport and the last
 * 90px, score control included, are clipped away). Nothing here is about the
 * clipping, so it is measured where the clipping is absent.
 */
const WIDE = { width: 1280, height: 800 } as const

/**
 * Half the margin the fix adds on each side, in pixels. The visual square is
 * 24px tall and the target 44px, so the hit area reaches 10px past the box in
 * each direction; probing at 8 stays clear of both edges - well outside the
 * 24px box, comfortably inside the 44px one - so a rounding difference between
 * engines cannot decide the result.
 */
const PROBE = 8

async function openFirstEntry(page: Page) {
  const rows = page.getByRole("listbox", { name: "Entries" }).getByRole("option")
  await expect(rows.first()).toBeVisible()

  await rows.first().click()
  await expect(page.getByTestId("entry-header")).toBeVisible()
}

const scoreButton = (page: Page, n: number) =>
  page.getByTestId("entry-header").getByRole("button", { name: `Set score to ${n}` })

/**
 * The accessible name of the button that would receive a tap at this point,
 * or a tag-name marker when the point lands on something that is not a button.
 *
 * closest() rather than the hit element itself because a point over a square's
 * digit resolves to the text node's parent, and a point over the added hit
 * area resolves to the button that owns the pseudo-element; both should read
 * as the same control.
 */
async function controlAtPoint(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px, py)
      if (!el) return "<nothing>"
      const button = el.closest("button")
      return button?.getAttribute("aria-label") ?? `<${el.tagName.toLowerCase()}>`
    },
    [x, y] as [number, number]
  )
}

async function squareBox(page: Page, n: number) {
  const box = await scoreButton(page, n).boundingBox()
  expect(box, `score ${n} should be laid out`).not.toBeNull()
  return box!
}

test.describe("Score target size", () => {
  test.use({ viewport: WIDE })

  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
    await openFirstEntry(page)
    // The seeded first entry is unscored, so the control is in its expanded
    // state and all five squares are on screen. If that ever stops being true
    // this fails here rather than misreporting a geometry result.
    await expect(scoreButton(page, 1)).toBeVisible()
  })

  test("every square answers a tap well above and below its visible edge", async ({
    page,
  }) => {
    for (let n = 1; n <= 5; n++) {
      const box = await squareBox(page, n)
      const centreX = box.x + box.width / 2

      expect(
        await controlAtPoint(page, centreX, box.y - PROBE),
        `${PROBE}px above score ${n}`
      ).toBe(`Set score to ${n}`)

      expect(
        await controlAtPoint(page, centreX, box.y + box.height + PROBE),
        `${PROBE}px below score ${n}`
      ).toBe(`Set score to ${n}`)
    }
  })

  /**
   * The other half of the same fix, and the reason it is vertical. An enlarged
   * hit area that reached sideways would put score n's target over score n-1's
   * square, so a tap aimed at a digit the reader can see would write the one
   * next to it. Probing just inside each square's own left and right edges, at
   * the height the enlargement reaches, says the columns still belong to the
   * scores drawn in them.
   */
  test("the enlarged targets do not reach into each other", async ({ page }) => {
    for (let n = 1; n <= 5; n++) {
      const box = await squareBox(page, n)
      const y = box.y - PROBE

      expect(
        await controlAtPoint(page, box.x + 1, y),
        `inside score ${n}'s left edge, above the square`
      ).toBe(`Set score to ${n}`)

      // Two pixels in, not one: the hit area is `inset-x-0` against the
      // button's PADDING box, and every square but the last spends its final
      // pixel on the `border-r` that divides it from the next. That pixel
      // belongs to neither target above the squares, which is the conservative
      // end of the trade - a shared border that answers for the score on its
      // left would be the overlap this test exists to rule out.
      expect(
        await controlAtPoint(page, box.x + box.width - 2, y),
        `inside score ${n}'s right edge, above the square`
      ).toBe(`Set score to ${n}`)

      // And nothing of score n reaches past its own column into the next.
      if (n < 5) {
        expect(
          await controlAtPoint(page, box.x + box.width + 1, y),
          `past score ${n}'s right edge, above the squares`
        ).toBe(`Set score to ${n + 1}`)
      }
    }
  })

  /**
   * What the geometry is for. The click is placed by page.mouse at an absolute
   * point rather than through locator.click(), which would aim at the centre
   * and pass against a 24px target as happily as against a 44px one.
   *
   * The assertion is the collapsed control, which ScoreButtons only renders
   * once a score is set, so a click that landed on the wrapper instead of the
   * button leaves the five squares showing and fails here.
   */
  test("a tap above a square scores that square", async ({ page }) => {
    const box = await squareBox(page, 4)

    await page.mouse.click(box.x + box.width / 2, box.y - PROBE)

    await expect(
      page.getByTestId("entry-header").getByRole("button", { name: /^Score: 4\./ })
    ).toBeVisible()
  })

  /**
   * The state a reader spends most of their time in. Once an entry is scored
   * the five squares collapse to one, which is the same 24px box and reopens
   * the row when tapped - so it needs the same margin, and it is the button a
   * reader reaches for when they want to CHANGE a score they have already set.
   */
  test("the collapsed score answers a tap above it too", async ({ page }) => {
    await scoreButton(page, 2).click()

    const collapsed = page
      .getByTestId("entry-header")
      .getByRole("button", { name: /^Score: 2\./ })
    await expect(collapsed).toBeVisible()

    const box = (await collapsed.boundingBox())!
    expect(box).not.toBeNull()

    await page.mouse.click(box.x + box.width / 2, box.y - PROBE)

    await expect(scoreButton(page, 2)).toBeVisible()
  })

  /**
   * The constraint the fix had to work inside, asserted so a later "just make
   * them bigger" cannot quietly take the row's horizontal budget. The five
   * squares plus the group's two 1px borders are 122px; the header's action
   * row is already wider than its pane at every viewport below about 1114px
   * (ttrb-1zn8), so there is nothing to spend here.
   */
  test("the enlarged targets cost the toolbar no room", async ({ page }) => {
    const first = await squareBox(page, 1)
    const last = await squareBox(page, 5)

    expect(last.x + last.width - first.x).toBeLessThanOrEqual(122)

    for (let n = 1; n <= 5; n++) {
      const box = await squareBox(page, n)
      expect(box.width, `score ${n} laid-out width`).toBeLessThanOrEqual(25)
      expect(box.height, `score ${n} laid-out height`).toBeLessThanOrEqual(25)
    }
  })
})
