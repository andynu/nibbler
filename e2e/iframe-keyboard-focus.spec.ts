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
 */
const EMBEDDED_PAGE = `<!doctype html>
<html>
  <head><title>Embedded page</title></head>
  <body style="margin:0;padding:2rem;font:16px system-ui">
    <h1>Embedded page</h1>
    <input id="probe" aria-label="Embedded field" />
    <p>Body text, so the frame has something in it.</p>
    <script>document.getElementById("probe").focus()</script>
  </body>
</html>`

function iframeElement(page: Page) {
  return page.locator("iframe[src^='https://e2e.invalid/']")
}

function embeddedField(page: Page) {
  return page
    .frameLocator("iframe[src^='https://e2e.invalid/']")
    .locator("#probe")
}

const restoreShortcuts = (page: Page) =>
  page.getByRole("button", { name: /restore shortcuts/i })

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
        body: EMBEDDED_PAGE,
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

  test("clicking into the frame hands the keys over and says so", async ({
    page,
  }) => {
    await openFirstEntry(page)
    const beforeClick = await currentSrc(page)

    await embeddedField(page).click()

    await expect(restoreShortcuts(page)).toBeVisible()

    // The keypress landing in the embedded document is both the proof that
    // control really moved and a deterministic way to wait for it.
    await page.keyboard.press("j")
    await expect(embeddedField(page)).toHaveValue("j")
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
