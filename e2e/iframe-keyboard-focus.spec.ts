import { test, expect, type Page } from "./fixtures"

/**
 * Keyboard control across the embedded-page boundary (ttrb-gmhv).
 *
 * Focus is browser behaviour, so this cannot be checked with a test double.
 * Every seeded entry links to https://e2e.invalid/..., a TLD that never
 * resolves, which makes it safe to answer here with a real document: the frame
 * is genuinely cross-origin from the app on 127.0.0.1 and keeps real focus
 * semantics, while nothing leaves the machine.
 *
 * The page focuses its own field with a script rather than with the autofocus
 * attribute: Chromium ignores autofocus in a cross-origin subframe but honours
 * a scripted focus(), and the scripted one is what silently killed j/k.
 *
 * The document names the URL it was served for. Without that every entry's page
 * is byte-identical, so a frame that never renavigated would be indistinguishable
 * from one that did, and the only thing left to assert is the src attribute -
 * which is set from the entry either way (ttrb-mq4n).
 *
 * It also records every key it receives. A key arriving here and not in the
 * parent is what "the frame has the keyboard" means, and it is the same fact in
 * both engines. The field's value is not: Playwright's click into a cross-origin
 * frame leaves the frame's own activeElement on the input under Chromium and on
 * the body under Firefox, so the key is delivered either way but only Chromium
 * types a character with it.
 */
const embeddedPage = (url: string) => `<!doctype html>
<html>
  <head><title>Embedded page</title></head>
  <body style="margin:0;padding:2rem;font:16px system-ui">
    <h1>Embedded page</h1>
    <p id="served-for">${url}</p>
    <input id="probe" aria-label="Embedded field" />
    <p id="keylog"></p>
    <a id="embedded-link" href="/followed-from-inside">A link on the embedded page</a>
    <script>
      document.getElementById("probe").focus()
      document.addEventListener("keydown", function (event) {
        document.getElementById("keylog").textContent += event.key
      }, true)
    </script>
  </body>
</html>`

function iframeElement(page: Page) {
  return page.locator("iframe[src^='https://e2e.invalid/']")
}

function embeddedFrame(page: Page) {
  return page.frameLocator("iframe[src^='https://e2e.invalid/']")
}

function embeddedField(page: Page) {
  return embeddedFrame(page).locator("#probe")
}

/** Every key the embedded document has received, in order. */
function embeddedKeylog(page: Page) {
  return embeddedFrame(page).locator("#keylog")
}

const restoreShortcuts = (page: Page) =>
  page.getByRole("button", { name: /restore shortcuts/i })

/**
 * Why the handoff examples are worth running under both engines (ttrb-ngol).
 *
 * The two browsers report a cross-origin focus handoff differently, and for a
 * while the guard only understood one of them. Chromium fires focusout on the
 * anchor and then a window blur, both with `document.activeElement` already the
 * iframe. Firefox fires nothing at all on the way in - no blur, no focusout, no
 * focusin, no focus event on the iframe element - while still setting
 * `document.activeElement` to the iframe. The anchor's focusout does arrive in
 * Firefox, but not until focus comes back to this document, so it marks the way
 * out rather than the way in.
 *
 * The guard now reads `document.activeElement` on a timer, which is the one
 * signal both engines produce, so these examples run in both. They are the
 * regression test for the engine difference: an event-only guard passes them
 * under Chromium and fails every one of them under Firefox.
 */

/**
 * The pane focus mode collapses.
 *
 * Its width is the assertion handle rather than anything drawn inside it. The
 * pane is `overflow: hidden`, and Playwright's visibility check asks only
 * whether an element has a non-empty box and is not `display:none` or
 * `visibility:hidden`; it does not walk up the tree looking for an ancestor
 * that clips. A span inside a zero-width pane therefore keeps its own box and
 * reads as visible, which is how `getByText("NibbleRSS")).toBeHidden()` came to
 * be an assertion that could not pass on any machine (ttrb-8zv5).
 */
const sidebarPane = (page: Page) => page.getByTestId("sidebar-pane")

async function currentSrc(page: Page): Promise<string> {
  return (await iframeElement(page).getAttribute("src")) ?? ""
}

/**
 * Asserts the document inside the frame is the one the src attribute names.
 *
 * The two can disagree: React sets the attribute from `entry.link` on every
 * render, and an element that is reconciled rather than replaced can be left
 * pointing at a page it is not showing. Comparing them is the whole point of
 * serving a document that names its own URL.
 */
async function expectFrameShowsItsSrc(page: Page) {
  await expect
    .poll(async () => {
      const src = await currentSrc(page)
      const servedFor = await embeddedFrame(page)
        .locator("#served-for")
        .textContent()
        .catch(() => null)
      return servedFor === src ? "frame matches src" : `src ${src}, showing ${servedFor}`
    }, { timeout: 15000 })
    .toBe("frame matches src")
}

/**
 * Waits until focus is parked in the reader's own document rather than in the
 * frame, which is the condition under which its keydown listeners fire at all.
 */
async function expectKeysInReader(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName ?? "NONE"))
    .not.toBe("IFRAME")
}

async function openFirstEntry(page: Page) {
  // j is a no-op until the list has entries to walk.
  const rows = page.getByRole("listbox", { name: "Entries" }).getByRole("option")
  await expect(rows.first()).toBeVisible()

  // One press, deliberately not retried. A press issued the instant the rows
  // appear used to be dropped about 2 times in 30, because useKeyboardCommands
  // swapped its keydown listener in a passive effect and passive effects run
  // after paint (ttrb-lix7). The listener is now registered once and reads the
  // commands from a ref written in the commit phase, so this press cannot land
  // on a stale closure. Retrying here again would hide that regression.
  await page.keyboard.press("j")
  await expect(iframeElement(page)).toBeVisible({ timeout: 5000 })

  await expect(embeddedField(page)).toBeVisible()
  await expectKeysInReader(page)
}

async function bootInIframeView(page: Page) {
  await page.route("https://e2e.invalid/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: embeddedPage(route.request().url()),
    })
  )

  // Start in iframe view from the first render. Toggling with `i` after load
  // would race the preferences fetch, which sets the view mode when it lands.
  const response = await page.request.patch("/api/v1/preferences", {
    data: { content_view_mode: "iframe" },
  })
  expect(response.ok()).toBe(true)

  await page.goto("/")
  await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
}

test.describe("Keyboard control with a page embedded", () => {
  test.beforeEach(async ({ page }) => {
    await bootInIframeView(page)
  })

  test("j keeps advancing once the framed page has loaded", async ({ page }) => {
    await openFirstEntry(page)
    const first = await currentSrc(page)

    // No click in between: this is the walk that used to die silently.
    await page.keyboard.press("j")

    await expect(iframeElement(page)).not.toHaveAttribute("src", first)
    await expect(restoreShortcuts(page)).toBeHidden()
  })

  test("each j puts the next entry's page in the frame, not just in its src", async ({
    page,
  }) => {
    await openFirstEntry(page)
    await expectFrameShowsItsSrc(page)
    const visited = [await currentSrc(page)]

    // Two steps rather than one: the frame element survives an entry change
    // only because the loading branch tears the whole content pane down, and a
    // single step would not distinguish "renavigates" from "renavigates once".
    for (let step = 0; step < 2; step++) {
      const previous = await currentSrc(page)
      await page.keyboard.press("j")
      await expect(iframeElement(page)).not.toHaveAttribute("src", previous)
      await expectFrameShowsItsSrc(page)
      visited.push(await currentSrc(page))
    }

    expect(new Set(visited).size).toBe(visited.length)
  })

  test("coming back to an entry reloads its page, not the one the frame wandered to", async ({
    page,
  }) => {
    await openFirstEntry(page)
    // Off the first entry, so Previous is enabled.
    await page.keyboard.press("j")
    await expectFrameShowsItsSrc(page)
    const entryPage = await currentSrc(page)

    // A click inside the frame navigates the embedded document without touching
    // the src attribute, which is how the element's attribute and its contents
    // come to disagree in the first place.
    await embeddedFrame(page).locator("#embedded-link").click()
    await expect(embeddedFrame(page).locator("#served-for")).toHaveText(
      /followed-from-inside/
    )
    await expect(iframeElement(page)).toHaveAttribute("src", entryPage)

    // The frame holds the keys now, so navigate the way the header does.
    await page.getByRole("button", { name: "Previous entry" }).click()
    await expect(iframeElement(page)).not.toHaveAttribute("src", entryPage)
    await expectFrameShowsItsSrc(page)

    await page.getByRole("button", { name: "Next entry" }).click()
    await expect(iframeElement(page)).toHaveAttribute("src", entryPage)
    await expectFrameShowsItsSrc(page)
  })

  test("clicking into the frame hands the keys over and says so", async ({
    page,
  }) => {
    await openFirstEntry(page)
    const beforeClick = await currentSrc(page)

    await embeddedField(page).click()

    await expect(restoreShortcuts(page)).toBeVisible()

    // The keypress landing in the embedded document rather than in the reader
    // is both the proof that control really moved and a deterministic way to
    // wait for it. The src assertion is the other half: j is the reader's own
    // next-entry shortcut, so an unmoved frame says the parent never saw it.
    await page.keyboard.press("j")
    await expect(embeddedKeylog(page)).toHaveText("j")
    await expect(iframeElement(page)).toHaveAttribute("src", beforeClick)
  })

  test("the header still advances by mouse while the frame holds the keys", async ({
    page,
  }) => {
    await openFirstEntry(page)
    const beforeClick = await currentSrc(page)

    await embeddedField(page).click()
    await expect(restoreShortcuts(page)).toBeVisible()

    await page.getByRole("button", { name: "Next entry" }).click()

    await expect(iframeElement(page)).not.toHaveAttribute("src", beforeClick)
  })

  test("restoring shortcuts brings j back", async ({ page }) => {
    await openFirstEntry(page)

    await embeddedField(page).click()
    await expect(restoreShortcuts(page)).toBeVisible()

    await restoreShortcuts(page).click()
    await expect(restoreShortcuts(page)).toBeHidden()
    await expectKeysInReader(page)

    const restored = await currentSrc(page)
    await page.keyboard.press("j")

    await expect(iframeElement(page)).not.toHaveAttribute("src", restored)
  })

  test("focus mode can be left by mouse after the frame takes the keys", async ({
    page,
  }) => {
    await openFirstEntry(page)

    await page.keyboard.press("Shift+F")
    await expect(sidebarPane(page)).toHaveCSS("width", "0px")

    await embeddedField(page).click()
    await expect(restoreShortcuts(page)).toBeVisible()

    await page.getByRole("button", { name: "Exit focus mode" }).click()

    // 240px is the expanded desktop width; waiting for the end value rather
    // than "anything but 0px" makes the 150ms transition part of the check.
    await expect(sidebarPane(page)).toHaveCSS("width", "240px")
  })
})

/**
 * What the handoff costs a phone (ttrb-s1xr).
 *
 * "Restore shortcuts" is a text button, not an icon, and it used to render in
 * the header's shrink-0 left cluster. Measured in Chromium with the frame
 * holding the keys, the header wanted 441px at 320, 375 AND 414 - the same
 * number at all three, because nothing in that row is width-responsive - and
 * "More article actions" was laid out at 405..441 in every one of them. Off
 * screen entirely at 320 and 375; 9 of its 36px on screen at 414. "Open in new
 * tab" (367..403) went with it at the two narrower widths.
 *
 * That trigger is the whole toolbar below the xs breakpoint: note, publish,
 * framing, follow, score and copy link are all behind it, and the framing row
 * is how a phone leaves iframe view at all. So a tap on any field or link
 * inside an embedded page took every one of them away, in a state the reader
 * reaches by doing the ordinary thing with an embedded page. Shedding the
 * publish button the way ttrb-h12t did does not reach this: 441 is the
 * post-shed number.
 *
 * These cannot be component tests. happy-dom loads no stylesheet, so the
 * responsive classes are inert and every header button answers getByRole at
 * every width; EntryContent.test.tsx holds the structural half instead. Nor is
 * a page-level overflow check enough: the pane clips rather than scrolls, and
 * `documentElement.scrollWidth` stayed at the viewport width throughout. The
 * header itself has to be measured, as ttrb-h12t did.
 */
const PHONE_WIDTHS = [320, 375, 414] as const

const overflowTrigger = (page: Page) =>
  page.getByRole("button", { name: "More article actions" })

/**
 * Opens by tap rather than by `j`. At these widths the list and the article are
 * alternate panes rather than columns, and a phone has no keyboard to press.
 */
async function openFirstEntryByTap(page: Page) {
  const rows = page.getByRole("listbox", { name: "Entries" }).getByRole("option")
  await expect(rows.first()).toBeVisible()

  await rows.first().click()
  await expect(page.getByTestId("entry-header")).toBeVisible()
  await expect(iframeElement(page)).toBeVisible({ timeout: 5000 })
  await expect(embeddedField(page)).toBeVisible()
  await expectKeysInReader(page)
}

/** Fully within the viewport, both edges. */
function expectOnScreen(
  box: { x: number; width: number } | null,
  width: number
) {
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(width)
}

for (const width of PHONE_WIDTHS) {
  test.describe(`A framed page holding the keys at ${width}px`, () => {
    test.use({ viewport: { width, height: 720 } })

    test.beforeEach(async ({ page }) => {
      await bootInIframeView(page)
      await openFirstEntryByTap(page)

      await embeddedField(page).click()
      await expect(restoreShortcuts(page)).toBeVisible()
    })

    test("leaves the header inside the viewport", async ({ page }) => {
      const header = await page
        .getByTestId("entry-header")
        .evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))

      expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth)
    })

    test("leaves the overflow trigger on screen", async ({ page }) => {
      expectOnScreen(await overflowTrigger(page).boundingBox(), width)
    })

    // A guard, not a catcher: it passes against the unfixed header too, because
    // Playwright dispatches a click at the trigger's centre whether or not that
    // point is inside the viewport and a reader's thumb cannot. What it holds is
    // the other half of the claim - that this menu really is the phone's only
    // exit from iframe view, so the two examples above are about an exit and not
    // about tidiness.
    test("leaves the way out of iframe view reachable", async ({ page }) => {
      await overflowTrigger(page).click()
      await expect(page.getByRole("menu")).toBeVisible()

      await page.getByRole("menuitem", { name: "Show RSS content" }).click()

      await expect(iframeElement(page)).toHaveCount(0)
    })

    // Also a guard rather than a catcher - the control was on screen before the
    // move too, at 136..275. It is here because the fix moves it, and an
    // affordance parked past the right edge of a frame nobody can scroll would
    // be the same bug wearing the other hat.
    test("keeps the restore control itself on screen", async ({ page }) => {
      expectOnScreen(await restoreShortcuts(page).boundingBox(), width)
    })
  })
}
