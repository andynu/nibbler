import { test, expect, type Page } from "./fixtures"

/**
 * Whether the article header's action row fits the pane it is drawn in, and
 * whether every action it drops is reachable some other way (ttrb-1zn8).
 *
 * The defect this file exists for. EntryContent's header used to shed its
 * buttons on VIEWPORT breakpoints - `xs` at 30rem, `sm` at 40rem - while the
 * pane it lives in is a fraction of the window, so the two numbers had nothing
 * to do with each other. Measured on the seeded first entry before the fix:
 *
 *   viewport 640   pane 320   row 554   234px over
 *   viewport 700   pane 380   row 554   174px over
 *   viewport 768   pane 448   row 554   106px over
 *   viewport 1024  pane 464   row 554    90px over
 *   viewport 1280  pane 720   row 720   fits
 *
 * Every one of those viewports is at or above `sm`, so every `sm:` utility in
 * the header fired and all 450px of action row was drawn into a 320px box. The
 * pane clips rather than scrolls and documentElement.scrollWidth stays at the
 * viewport width, so nothing reported it: at 1024 the row ran 664..1114 and the
 * last 90px - the score control, the framing toggle, "Follow this story" and
 * "Open in new tab" - were off screen. EntryActionsMenu hid itself on that same
 * `sm`, so above 640 there was no second route to any of them either.
 *
 * Why these assertions are geometric. Playwright's toBeVisible() is about
 * display/visibility/opacity and a button clipped by an ancestor still answers
 * it; locator.click() aims at an element's centre whether or not that point is
 * on screen. So neither a visibility check nor a click can tell a reachable
 * control from an unreachable one - only where its box actually lands can. And
 * vitest cannot help at all here: happy-dom loads no stylesheet, so every
 * responsive class is inert and every box is zero by zero.
 *
 * The 640 case is the sharpest: it is the narrowest pane in the whole layout
 * (320px, half a 640px window) while sitting on the widest of the old
 * breakpoints.
 */

/**
 * The tablet-and-up band, which is exactly the band that was broken: below 640
 * the panes are swapped rather than tiled, so the pane is the viewport and
 * e2e/mobile-article-actions.spec.ts already covers it.
 *
 * 640, 700, 768 and 1024 are the four measured on the ticket, and they all
 * land in the narrowest tier (a 320-464px pane). 800 and 1100 are here because
 * nothing in that list reaches the middle tier - a pane of 480 to 639, where
 * the score control is shed and the other four are not - and a band with no
 * example is a band where the menu could go missing unnoticed. 1280 is the
 * width that fit before this fix, so a change that trades the wide case for
 * the narrow one fails here rather than shipping.
 */
const VIEWPORTS = [640, 700, 768, 800, 1024, 1100, 1280] as const

/**
 * The two pane widths the header sheds on, in CSS pixels. They are the
 * `@min-[30rem]` and `@min-[40rem]` container queries in EntryContent, read
 * against the `article-pane` container on that component's root - whose width
 * is the pane's, since the pane element carries no padding.
 */
const MID_PANE = 480
const WIDE_PANE = 640

interface Action {
  /** How this control is named in a failure message. */
  what: string
  /** Its accessible name in the header toolbar. */
  header: RegExp
  /**
   * Its role there. "Open in new tab" is a Button rendered `asChild` over an
   * anchor, so it answers to link rather than button; everything else is a
   * plain button.
   */
  headerRole?: "button" | "link"
  /**
   * Its row in EntryActionsMenu, or null for a control with no menu twin.
   * A null here is a claim that the header keeps this control at every pane
   * width, and the assertions below hold it to that.
   */
  menu: { role: "menuitem" | "menuitemradio"; name: RegExp } | null
  /**
   * The narrowest pane at which the header itself draws this control.
   * 0 means "at every width".
   */
  headerFrom: number
}

/**
 * Every control in the action row, with where it lives at each width.
 *
 * The score control is represented by one of its five squares. All five are
 * laid out by the same wrapper, so a wrapper that overflows takes the later
 * ones off screen first - which is why 3 is probed rather than 1.
 */
const ACTIONS: Action[] = [
  { what: "mark read", header: /^(Mark as read|Mark as unread)$/, menu: null, headerFrom: 0 },
  { what: "star", header: /^(Add star|Remove star)$/, menu: null, headerFrom: 0 },
  {
    what: "publish toggle",
    header: /^(Add to public feed|Remove from public feed)$/,
    menu: { role: "menuitem", name: /^(Add to public feed|Remove from public feed)$/ },
    headerFrom: MID_PANE,
  },
  {
    what: "note",
    header: /^(Add note|Edit note)$/,
    menu: { role: "menuitem", name: /^(Add note|Edit note)$/ },
    headerFrom: MID_PANE,
  },
  {
    what: "framing toggle",
    header: /^(Show original page|Show RSS content)$/,
    menu: { role: "menuitem", name: /^(Show original page|Show RSS content)$/ },
    headerFrom: MID_PANE,
  },
  {
    what: "follow this story",
    header: /^Follow this story$/,
    menu: { role: "menuitem", name: /^Follow this story$/ },
    headerFrom: MID_PANE,
  },
  {
    what: "score",
    header: /^Set score to 3$/,
    menu: { role: "menuitemradio", name: /^Score 3$/ },
    headerFrom: WIDE_PANE,
  },
  {
    what: "open in new tab",
    header: /^Open in new tab$/,
    headerRole: "link",
    menu: null,
    headerFrom: 0,
  },
  {
    // Keyed to the window rather than the pane on purpose: it is the control
    // that WIDENS the pane, so a pane-keyed version would delete it exactly
    // where it is needed. Every viewport in this file is at or above `sm`, so
    // it is in the header throughout.
    what: "focus mode",
    header: /^(Enter focus mode|Exit focus mode)$/,
    menu: null,
    headerFrom: 0,
  },
]

async function openFirstEntry(page: Page) {
  const rows = page.getByRole("listbox", { name: "Entries" }).getByRole("option")
  await expect(rows.first()).toBeVisible()

  await rows.first().click()
  await expect(page.getByTestId("entry-header")).toBeVisible()
}

const overflowTrigger = (page: Page) =>
  page.getByRole("button", { name: "More article actions" })

/**
 * Same wait as e2e/mobile-article-actions.spec.ts, for the same reason: a Radix
 * menu is modal and stays mounted through its closing animation, so opening a
 * second one too early finds two role="menu" nodes and trips strict mode.
 */
async function openOverflowMenu(page: Page) {
  await expect(page.getByRole("menu")).toHaveCount(0)
  await expect(overflowTrigger(page)).toBeVisible()
  await overflowTrigger(page).click()
  await expect(page.getByRole("menu")).toBeVisible()
}

async function paneBox(page: Page) {
  const box = await page.getByTestId("entry-header").boundingBox()
  expect(box, "the article header should be laid out").not.toBeNull()
  return box!
}

const headerControl = (page: Page, action: Action) =>
  page
    .getByTestId("entry-header")
    .getByRole(action.headerRole ?? "button", { name: action.header })
    .first()

interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Whether the header is actually offering this control: rendered, not hidden,
 * and laid out inside the pane.
 *
 * The third clause is the one that matters and the reason this is not just
 * isVisible(). A control drawn at x=664..1114 in a pane that ends at 464 is
 * `display: inline-flex`, has a non-empty bounding box and answers
 * toBeVisible() - it is simply not on screen, because the pane clips instead
 * of scrolling. Treating that as present is exactly the mistake the shipped
 * code made.
 */
async function offeredInHeader(page: Page, action: Action, pane: BoundingBox) {
  const control = headerControl(page, action)
  if ((await control.count()) === 0 || !(await control.isVisible())) return false

  const box = await control.boundingBox()
  if (!box) return false
  return box.x >= pane.x - 0.5 && box.x + box.width <= pane.x + pane.width + 0.5
}

for (const width of VIEWPORTS) {
  test.describe(`Article header at a ${width}px viewport`, () => {
    test.use({ viewport: { width, height: 800 } })

    test.beforeEach(async ({ page }) => {
      await page.goto("/")
      await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
      await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
      await openFirstEntry(page)
    })

    /**
     * The overflow itself, measured on the element that clips. Comparing
     * against the viewport instead would miss it entirely: at 1024 the pane is
     * 464px and the row 554, and the window has room for both.
     */
    test("the header's content fits the pane", async ({ page }) => {
      const measured = await page
        .getByTestId("entry-header")
        .evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))

      expect(
        measured.scrollWidth,
        `header content ${measured.scrollWidth}px in a ${measured.clientWidth}px pane`
      ).toBeLessThanOrEqual(measured.clientWidth)
    })

    /**
     * The consequence, control by control. A button whose box runs past the
     * pane's right edge is one the reader cannot press, whatever toBeVisible()
     * says about it, and this is the assertion that says so.
     */
    test("nothing the header draws lands outside the pane", async ({ page }) => {
      const pane = await paneBox(page)

      for (const action of ACTIONS) {
        const control = headerControl(page, action)
        if ((await control.count()) === 0 || !(await control.isVisible())) continue

        const box = (await control.boundingBox())!
        expect(box, `${action.what} should be laid out`).not.toBeNull()
        expect(
          box.x,
          `${action.what} starts at ${box.x}, pane starts at ${pane.x}`
        ).toBeGreaterThanOrEqual(pane.x - 0.5)
        expect(
          box.x + box.width,
          `${action.what} ends at ${box.x + box.width}, pane ends at ${pane.x + pane.width}`
        ).toBeLessThanOrEqual(pane.x + pane.width + 0.5)
      }
    })

    /**
     * The other half of the bug, and the half a fits-the-pane assertion alone
     * would let back in: a row can be made to fit by dropping buttons into
     * nowhere. Every action is enumerated here, and each one has to be either
     * on screen in the header or a row in a menu whose trigger is itself on
     * screen. Nothing is allowed to be neither, which is the state six of them
     * were in at every viewport from 640 to 1024.
     */
    test("every article action is reachable", async ({ page }) => {
      const pane = await paneBox(page)

      const shed: Action[] = []
      for (const action of ACTIONS) {
        const present = await offeredInHeader(page, action, pane)

        // The tier boundaries are asserted, not merely described: a control
        // the header claims to keep at this width has to be there and has to
        // be on screen, so shedding too eagerly fails here as loudly as
        // shedding too late.
        if (pane.width >= action.headerFrom) {
          expect(
            present,
            `${action.what} should be in the header, on screen, at a ${pane.width}px pane`
          ).toBe(true)
        }
        if (present) continue

        expect(
          action.menu,
          `${action.what} is not reachable in the header at a ${pane.width}px pane and has no menu row`
        ).not.toBeNull()
        shed.push(action)
      }

      if (shed.length === 0) {
        // Nothing is missing, so the trigger has no job. Asserting this is what
        // keeps the menu honest at the wide end rather than leaving a stray
        // control in a toolbar that has room for everything.
        await expect(overflowTrigger(page)).toBeHidden()
        return
      }

      // The trigger has to be reachable too, by the same standard. At 320px it
      // was the control the row pushed off its own edge (ttrb-h12t), which took
      // everything behind it with it; from 640 up it was hidden outright while
      // five of its rows were still needed.
      await expect(
        overflowTrigger(page),
        `${shed.map((a) => a.what).join(", ")} shed at a ${pane.width}px pane, so the menu must be offered`
      ).toBeVisible()
      const trigger = (await overflowTrigger(page).boundingBox())!
      expect(trigger, "the overflow trigger should be laid out").not.toBeNull()
      expect(trigger.x).toBeGreaterThanOrEqual(pane.x - 0.5)
      expect(trigger.x + trigger.width).toBeLessThanOrEqual(pane.x + pane.width + 0.5)

      await openOverflowMenu(page)
      for (const action of shed) {
        await expect(
          page.getByRole(action.menu!.role, { name: action.menu!.name }),
          `${action.what} is shed at a ${pane.width}px pane, so the menu must carry it`
        ).toBeVisible()
      }
    })

    /**
     * The two controls the ticket named, asserted by themselves so a failure
     * reads as the reported symptom rather than as a loop index. At 640 the
     * five score squares laid out at x=589..709 against a pane ending at 640,
     * so 3, 4 and 5 were off screen; "Open in new tab" sat beyond them.
     */
    test("the score control and Open in new tab are on screen or in the menu", async ({
      page,
    }) => {
      const pane = await paneBox(page)
      const header = page.getByTestId("entry-header")

      const openInNewTab = (await header
        .getByRole("link", { name: "Open in new tab" })
        .boundingBox())!
      expect(openInNewTab).not.toBeNull()
      expect(openInNewTab.x + openInNewTab.width).toBeLessThanOrEqual(pane.x + pane.width + 0.5)

      // 5, not 1: the five squares are laid out left to right by one wrapper,
      // so a wrapper that runs past the edge loses the high scores first. At
      // 640 they sat at 589..709 against a pane ending at 640.
      const square: Action = {
        what: "score 5",
        header: /^Set score to 5$/,
        menu: { role: "menuitemradio", name: /^Score 5$/ },
        headerFrom: WIDE_PANE,
      }
      if (!(await offeredInHeader(page, square, pane))) {
        await openOverflowMenu(page)
        await expect(page.getByRole("menuitemradio", { name: "Score 5" })).toBeVisible()
      }
    })
  })
}
