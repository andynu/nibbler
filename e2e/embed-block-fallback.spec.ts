import { test, expect, type Page } from "./fixtures"

/**
 * The fallback the reader gets when a site refuses to be framed (ttrb-watz).
 *
 * A refused frame is invisible to the embedder: the iframe element fires
 * `load`, not `error`, and the refusal document commits on the target's own
 * origin, so the parent cannot tell it apart from a page that rendered. The
 * server answers the question instead, from the page's own headers, and this
 * covers what the browser does with that answer.
 *
 * Getting past OFFLINE_FEED_FETCH
 * -------------------------------
 * bin/e2e-server sets OFFLINE_FEED_FETCH=1, which short-circuits
 * EmbedPolicyProbe to :unknown for every entry, so the server can never
 * produce a "blocked" answer for the suite to render. The answer is therefore
 * supplied at the browser with page.route, the same interception
 * error-handling.spec.ts uses throughout.
 *
 * That is the right seam rather than a workaround. The probe's own reading of
 * headers is settled by 21 unit examples in
 * test/services/embed_policy_probe_test.rb and four controller examples over
 * GET /api/v1/entries/:id/embed_policy; neither of those can show what the
 * reader actually sees. What is left to prove here is the half that needs a
 * real browser: which of the frame and the fallback panel gets mounted for a
 * given answer, and that the answer is re-asked when the entry changes.
 *
 * Every seeded entry links to https://e2e.invalid/..., a TLD that never
 * resolves, so the frame is answered locally too. Without that the embeddable
 * examples would assert against a frame still waiting on DNS.
 */
const EMBEDDED_PAGE = `<!doctype html>
<html>
  <head><title>Embedded page</title></head>
  <body style="margin:0;padding:2rem;font:16px system-ui">
    <h1>Embedded page</h1>
  </body>
</html>`

type EmbedPolicy = { status: string; reason: string | null }

const BLOCKED: EmbedPolicy = {
  status: "blocked",
  reason: "x-frame-options: deny",
}
const EMBEDDABLE: EmbedPolicy = { status: "embeddable", reason: null }
const UNKNOWN: EmbedPolicy = { status: "unknown", reason: "Connection timed out" }

/**
 * Answers every embed-policy probe with whatever the returned setter was last
 * given. A mutable answer rather than a second page.route call, so an example
 * can change the verdict between entries without re-registering a handler.
 */
async function stubEmbedPolicy(page: Page, initial: EmbedPolicy) {
  let policy = initial

  await page.route("**/api/v1/entries/*/embed_policy", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(policy),
    })
  )

  return (next: EmbedPolicy) => {
    policy = next
  }
}

const frame = (page: Page) => page.locator("iframe[src^='https://e2e.invalid/']")

/**
 * The fallback panel by test id rather than by its copy. The header carries an
 * "Open in new tab" link of its own, so the panel needs a handle its contents
 * can be scoped to before that link can be asserted on unambiguously.
 */
const fallback = (page: Page) => page.getByTestId("embed-blocked-fallback")

/**
 * Opens the first article by clicking it.
 *
 * `j` would do it too, but a keypress arriving before the list is listening is
 * simply lost, and there is no way to tell that apart from an entry that opened
 * and rendered nothing. Waiting on the header afterwards gates on the article
 * pane being up, which holds whichever of the frame and the fallback the
 * policy answer produces.
 */
async function openFirstEntry(page: Page) {
  const rows = page.getByRole("listbox", { name: "Entries" }).getByRole("option")
  await expect(rows.first()).toBeVisible()

  await rows.first().click()
  await expect(page.getByTestId("entry-header")).toBeVisible()
}

test.describe("Embedded page refused by its own headers", () => {
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

  test("a blocked answer replaces the frame with the fallback panel", async ({
    page,
  }) => {
    await stubEmbedPolicy(page, BLOCKED)

    await openFirstEntry(page)

    await expect(fallback(page)).toBeVisible()
    await expect(fallback(page).getByText("This site blocks embedding")).toBeVisible()
    await expect(
      fallback(page).getByText("Press i to read the feed's copy instead.")
    ).toBeVisible()

    // The panel replaces the frame; it does not sit alongside a blank one.
    await expect(frame(page)).toHaveCount(0)
  })

  test("the fallback offers the article in a new tab", async ({ page }) => {
    await stubEmbedPolicy(page, BLOCKED)

    await openFirstEntry(page)

    const link = fallback(page).getByRole("link", { name: /open in new tab/i })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute("href", /^https:\/\/e2e\.invalid\//)
    await expect(link).toHaveAttribute("target", "_blank")
  })

  test("the refusing header is there for anyone who hovers", async ({ page }) => {
    await stubEmbedPolicy(page, BLOCKED)

    await openFirstEntry(page)

    await expect(fallback(page)).toHaveAttribute("title", BLOCKED.reason as string)
  })

  test("an embeddable answer leaves the frame up", async ({ page }) => {
    await stubEmbedPolicy(page, EMBEDDABLE)

    await openFirstEntry(page)

    await expect(frame(page)).toBeVisible()
    await expect(fallback(page)).toBeHidden()
  })

  // A page the server could not reach says nothing about whether the reader's
  // own browser can, so the frame gets its try rather than an apology.
  test("an unknown answer still lets the frame try", async ({ page }) => {
    await stubEmbedPolicy(page, UNKNOWN)

    await openFirstEntry(page)

    await expect(frame(page)).toBeVisible()
    await expect(fallback(page)).toBeHidden()
  })

  test("the verdict is re-asked for each entry rather than sticking", async ({
    page,
  }) => {
    const setPolicy = await stubEmbedPolicy(page, BLOCKED)

    await openFirstEntry(page)
    await expect(fallback(page)).toBeVisible()

    setPolicy(EMBEDDABLE)
    await page.keyboard.press("j")

    await expect(frame(page)).toBeVisible()
    await expect(fallback(page)).toBeHidden()
  })

  test("a site that starts refusing takes the frame down on the next entry", async ({
    page,
  }) => {
    const setPolicy = await stubEmbedPolicy(page, EMBEDDABLE)

    await openFirstEntry(page)
    await expect(frame(page)).toBeVisible()

    setPolicy(BLOCKED)
    await page.keyboard.press("j")

    await expect(fallback(page)).toBeVisible()
    await expect(frame(page)).toHaveCount(0)
  })
})
