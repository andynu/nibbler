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

  // The press is retried rather than issued once, because a press landing in
  // the few milliseconds between the rows painting and React flushing that
  // render's effects is dropped: useKeyboardCommands swaps its keydown
  // listener in a passive effect, so the live listener still closes over the
  // previous render's empty entry list and handleKeyboardNext returns at its
  // `entries.length === 0` guard (ttrb-lix7). Nothing is selected yet while
  // the press is being retried, so every attempt opens the same first entry.
  // Remove this once ttrb-lix7 lands.
  await expect(async () => {
    await page.keyboard.press("j")
    await expect(iframeElement(page)).toBeVisible({ timeout: 5000 })
  }).toPass({ timeout: 20000 })

  await expect(embeddedField(page)).toBeVisible()
  await expectKeysInReader(page)
}

test.describe("Keyboard control with a page embedded", () => {
  test.beforeEach(async ({ page }) => {
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
