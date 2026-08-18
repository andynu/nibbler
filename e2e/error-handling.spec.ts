import { test, expect, type Page } from "./fixtures"

/**
 * Error handling and edge cases E2E tests.
 *
 * Tests application resilience against network errors, invalid data,
 * empty states, and various edge cases.
 */

// Helper to wait for app to be ready
async function waitForAppReady(page: Page) {
  await page.goto("/")
  await page.waitForSelector("button", { timeout: 10000 })
  // Wait for initial render to stabilize
  await expect(page.getByRole("button").first()).toBeEnabled()
}

/**
 * The sidebar button that selects the seeded "Rust Weekly" feed.
 *
 * Filtered by text rather than accessible name because the feed's own button is
 * named "Rust Weekly 4" (title plus unread badge) while its row also holds a
 * "Rust Weekly menu" button and a dnd-kit drag handle that renders as
 * role=button with no name at all. Text is what separates the three.
 *
 * E2eDataset seeds this feed for every example and the signedIn fixture expands
 * its category, so it is always present - no visibility guard.
 */
function seededFeedButton(page: Page) {
  return page
    .getByRole("navigation", { name: "Feeds" })
    .getByRole("button")
    .filter({ hasText: "Rust Weekly" })
}

/** The entry list's title bar heading, which names the current selection. */
function entryListTitle(page: Page) {
  return page.getByRole("heading", { level: 2 }).first()
}

// =============================================================================
// NETWORK ERROR SCENARIOS
// =============================================================================

test.describe("Network Error Handling", () => {
  test("handles feed list API failure gracefully", async ({ page }) => {
    // Abort feed requests
    await page.route("**/api/v1/feeds*", (route) => route.abort())

    await page.goto("/")

    // App should still load and show some UI
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
  })

  test("handles entry list API failure", async ({ page }) => {
    await waitForAppReady(page)

    // Now abort entry requests
    await page.route("**/api/v1/entries*", (route) => route.abort())

    // Selecting a feed fires the aborted entries request
    await seededFeedButton(page).click()

    // The selection still lands and the app stays interactive after the error
    await expect(entryListTitle(page)).toHaveText("Rust Weekly")
    await expect(page.getByRole("button").first()).toBeEnabled()
  })

  test("shows loading states during slow requests", async ({ page }) => {
    // Hold the entries response open until this test releases it. A fixed
    // sleep would let the loading state come and go before the assertions run;
    // gating the route makes the in-flight window last as long as we need.
    let releaseEntries = () => {}
    const entriesReleased = new Promise<void>((resolve) => {
      releaseEntries = resolve
    })
    await page.route("**/api/v1/entries*", async (route) => {
      await entriesReleased
      await route.continue()
    })

    await page.goto("/")

    // The reader shell is up, so the auth gate's own "Loading..." is gone and
    // the entry pane's placeholder is the only exact match left. Match it
    // exactly: /loading/i also substring-matches LabelManager's "Loading
    // tags..." and FilterManager's "Loading filters...".
    await expect(page.getByText("Select an entry to read")).toBeVisible({
      timeout: 10000,
    })
    const entryListLoading = page.getByText("Loading...", { exact: true })
    await expect(entryListLoading).toBeVisible()

    releaseEntries()

    // The placeholder is tied to the request, not just present at boot: it
    // goes away once the entries arrive and the list renders them.
    await expect(entryListLoading).toBeHidden()
    await expect(page.getByRole("option").first()).toBeVisible()
  })

  test("handles going offline", async ({ page, context }) => {
    await waitForAppReady(page)

    // Go offline
    await context.setOffline(true)

    // Try to refresh or load new content
    await page.keyboard.press("r") // Common refresh shortcut

    // Should handle offline gracefully - app remains usable
    await expect(page.getByRole("button").first()).toBeVisible()

    // Go back online
    await context.setOffline(false)
  })

  test("recovers after coming back online", async ({ page, context }) => {
    await waitForAppReady(page)

    // Go offline then back online
    await context.setOffline(true)
    await context.setOffline(false)

    // App should still be functional
    await expect(page.getByRole("button").first()).toBeEnabled()
  })
})

// =============================================================================
// API ERROR RESPONSES
// =============================================================================

test.describe("API Error Responses", () => {
  test("handles 500 error from API gracefully", async ({ page }) => {
    // Return 500 for feeds
    await page.route("**/api/v1/feeds*", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      })
    )

    await page.goto("/")

    // App should still render and remain interactive
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
  })

  test("handles 404 error gracefully", async ({ page }) => {
    await waitForAppReady(page)

    // Return 404 for a specific entry request
    await page.route("**/api/v1/entries/999999*", (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Not found" }),
      })
    )

    // Try to navigate to a non-existent entry
    await page.goto("/#entry/999999")

    // App should remain interactive after 404
    await expect(page.getByRole("button").first()).toBeEnabled()
  })

  test("handles malformed JSON response", async ({ page }) => {
    // Return invalid JSON
    await page.route("**/api/v1/feeds*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "not valid json {{{",
      })
    )

    await page.goto("/")

    // App should remain interactive despite parse error
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
  })

  test("handles empty array response", async ({ page }) => {
    // Return empty feeds
    await page.route("**/api/v1/feeds*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    )

    await page.goto("/")

    // App should show sidebar and remain interactive with empty data
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
  })
})

// =============================================================================
// EMPTY STATES
// =============================================================================

test.describe("Empty States", () => {
  test("shows appropriate state when no entries match filter", async ({
    page,
  }) => {
    await waitForAppReady(page)

    // Published is the one virtual folder E2eDataset leaves empty: it seeds
    // read and starred articles for every feed but never publishes one. Its
    // name is anchored because /published/i also matches nothing else in the
    // sidebar today, and would silently start matching a feed titled after it.
    await page.getByRole("button", { name: /^Published/ }).click()

    await expect(entryListTitle(page)).toHaveText("Published")
    await expect(page.getByText("No entries")).toBeVisible()
    await expect(page.getByRole("button").first()).toBeEnabled()
  })

  test("shows appropriate state when search finds nothing", async ({
    page,
  }) => {
    await waitForAppReady(page)

    // Open command palette and search for a string no feed, entry or command
    // contains
    await page.keyboard.press("Meta+k")
    const palette = page.getByRole("dialog")
    await expect(palette).toBeVisible()

    await palette.getByRole("combobox").fill("zzz-nonexistent-query-xyz")

    // CommandEmpty's copy, matched exactly and scoped to the palette so a feed
    // or entry title containing "no results" cannot satisfy this.
    await expect(
      palette.getByText("No results found.", { exact: true })
    ).toBeVisible()
    await expect(page.getByRole("button").first()).toBeEnabled()
  })

  test("handles feed with no entries", async ({ page }) => {
    // Mock an empty entries response
    await page.route("**/api/v1/entries*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    )

    await page.goto("/")
    // Wait for page to load - app should render without crashing
    await page.waitForLoadState("networkidle")
  })
})

// =============================================================================
// DATA EDGE CASES
// =============================================================================

test.describe("Data Edge Cases", () => {
  test("handles entries with missing optional fields", async ({ page }) => {
    // Mock entries with missing fields
    await page.route("**/api/v1/entries*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 1,
            title: "Entry with minimal data",
            feed_id: 1,
            // Missing: author, published_at, content, summary, url
          },
        ]),
      })
    )

    await page.goto("/")
    // Wait for page to load - app should render with minimal data
    await page.waitForLoadState("networkidle")
  })

  test("handles entries with null values", async ({ page }) => {
    await page.route("**/api/v1/entries*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 1,
            title: null,
            author: null,
            published_at: null,
            content: null,
            summary: null,
            feed_id: 1,
          },
        ]),
      })
    )

    await page.goto("/")
    // Wait for page to load - app should handle nulls gracefully
    await page.waitForLoadState("networkidle")
  })

  test("handles special characters in content", async ({ page }) => {
    await page.route("**/api/v1/entries*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 1,
            title: "Test with emoji 🎉 and ampersand & quotes",
            author: "Test Author",
            content: "<p>Content with &amp; HTML entities and special chars &lt;&gt;</p>",
            feed_id: 1,
          },
        ]),
      })
    )

    await page.goto("/")
    // Wait for page to load - app should render special characters safely
    await page.waitForLoadState("networkidle")
  })

  test("handles very long titles", async ({ page }) => {
    const longTitle =
      "This is an extremely long article title that goes on and on and on and should be truncated in the UI to prevent layout issues and ensure a good user experience when displaying article lists".repeat(
        3
      )

    await page.route("**/api/v1/entries*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 1,
            title: longTitle,
            feed_id: 1,
          },
        ]),
      })
    )

    await page.goto("/")
    // Wait for page to load - app should render long titles without breaking layout
    await page.waitForLoadState("networkidle")
  })

  test("handles unicode and RTL text", async ({ page }) => {
    await page.route("**/api/v1/entries*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 1,
            title: "مرحبا بالعالم - Hello World - 你好世界",
            content: "<p>Arabic: مرحبا</p><p>Chinese: 你好</p><p>Japanese: こんにちは</p>",
            feed_id: 1,
          },
        ]),
      })
    )

    await page.goto("/")
    // Wait for page to load - app should render unicode correctly
    await page.waitForLoadState("networkidle")
  })

  test("handles dates in various formats", async ({ page }) => {
    await page.route("**/api/v1/entries*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 1,
            title: "Article with date",
            published_at: "2024-01-15T10:30:00Z",
            feed_id: 1,
          },
          {
            id: 2,
            title: "Article with different date format",
            published_at: "Mon, 15 Jan 2024 10:30:00 GMT",
            feed_id: 1,
          },
          {
            id: 3,
            title: "Article with invalid date",
            published_at: "not-a-date",
            feed_id: 1,
          },
        ]),
      })
    )

    await page.goto("/")
    // Wait for page to load - app should handle various date formats
    await page.waitForLoadState("networkidle")
  })
})

// =============================================================================
// CONCURRENT ACTIONS
// =============================================================================

test.describe("Concurrent Actions", () => {
  test("handles rapid keyboard navigation", async ({ page }) => {
    await waitForAppReady(page)

    // Rapid keyboard presses - Playwright auto-waits for key events
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("j") // Navigate down
    }

    // App should still be responsive
    await expect(page.getByRole("button").first()).toBeEnabled()
  })

  test("handles multiple clicks in quick succession", async ({ page }) => {
    await waitForAppReady(page)

    // Click one sidebar feed three times with no assertion in between, so the
    // second and third clicks land while the first selection's entries request
    // is still in flight. Selecting a feed is idempotent, so the list has to
    // end up exactly where a single click would have left it.
    const feedButton = seededFeedButton(page)
    await feedButton.click()
    await feedButton.click()
    await feedButton.click()

    await expect(entryListTitle(page)).toHaveText("Rust Weekly")
    await expect(page.getByRole("option").first()).toBeVisible()
    await expect(page.getByRole("button").first()).toBeEnabled()
  })

  test("handles concurrent API requests", async ({ page }) => {
    await waitForAppReady(page)

    // Trigger multiple actions that would cause API requests
    await page.keyboard.press("r") // Refresh
    await page.keyboard.press("j") // Navigate
    await page.keyboard.press("o") // Open

    // App should remain interactive during concurrent requests
    await expect(page.getByRole("button").first()).toBeEnabled()
  })
})

// =============================================================================
// FORM VALIDATION
// =============================================================================

test.describe("Form Validation", () => {
  test("feed subscription handles invalid URL", async ({ page }) => {
    await waitForAppReady(page)

    const feedsBefore = await (await page.request.get("/api/v1/feeds")).json()

    // Open the subscribe dialog. The expanded sidebar has no subscribe button
    // of its own - it reaches the dialog through the "Add..." menu; the
    // "Subscribe to feed" button belongs to the collapsed rail.
    await page.getByRole("button", { name: "Add..." }).click()
    await page.getByRole("menuitem", { name: "Subscribe to Feed" }).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()

    const urlInput = dialog.getByLabel("Feed URL")
    await urlInput.fill("not-a-valid-url")
    await dialog.getByRole("button", { name: "Subscribe", exact: true }).click()

    // The field is type=url, so constraint validation rejects the value and the
    // form never submits: the dialog stays open and no feed is created.
    expect(
      await urlInput.evaluate((input: HTMLInputElement) => input.validity.valid)
    ).toBe(false)
    await expect(dialog).toBeVisible()

    const feedsAfter = await (await page.request.get("/api/v1/feeds")).json()
    expect(feedsAfter).toHaveLength(feedsBefore.length)
  })

  test("settings form handles invalid values", async ({ page }) => {
    await waitForAppReady(page)

    // Open settings
    const settingsButton = page
      .getByRole("button", { name: /settings|cog/i })
      .first()
    await settingsButton.click()

    // Wait for settings dialog
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible({ timeout: 5000 })

    await dialog.getByRole("tab", { name: "Preferences" }).click()

    // The accent hue slider is the settings dialog's only numeric field, bounded
    // 0-360. Home drives it to the minimum and the extra ArrowLeft asks for a
    // value below it. Driving it from the keyboard rather than filling the value
    // is deliberate: Locator.fill refuses out-of-range values on a range input,
    // so it would never reach the app under test.
    const accentHue = dialog.getByLabel("Accent color")
    await accentHue.press("Home")
    await accentHue.press("ArrowLeft")

    // Clamped, and stored as such: "0" surviving the round trip through
    // updatePreference is what a truthiness check on the saved hue would break.
    await expect(accentHue).toHaveValue("0")

    // Close settings
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()

    // App should handle gracefully
    await expect(page.getByRole("button").first()).toBeEnabled()
  })
})

// =============================================================================
// BROWSER EDGE CASES
// =============================================================================

test.describe("Browser Edge Cases", () => {
  test("handles page refresh", async ({ page }) => {
    await waitForAppReady(page)

    // Refresh the page
    await page.reload()

    // Should load successfully
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
  })

  test("handles back/forward navigation", async ({ page }) => {
    await waitForAppReady(page)

    // Selecting a feed pushes a history entry (useNavigationHistory), so back
    // and forward move between selections without changing the URL.
    await expect(entryListTitle(page)).toHaveText("All Feeds")
    await seededFeedButton(page).click()
    await expect(entryListTitle(page)).toHaveText("Rust Weekly")

    await page.goBack()
    await expect(entryListTitle(page)).toHaveText("All Feeds")
    await expect(page.getByRole("button").first()).toBeEnabled()

    await page.goForward()
    await expect(entryListTitle(page)).toHaveText("Rust Weekly")
    await expect(page.getByRole("button").first()).toBeEnabled()
  })

  test("handles local storage clearing", async ({ page }) => {
    await waitForAppReady(page)

    // Clear local storage
    await page.evaluate(() => localStorage.clear())

    // Refresh
    await page.reload()

    // App should remain interactive after storage clear
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
  })

  test("handles session storage clearing", async ({ page }) => {
    await waitForAppReady(page)

    // Clear session storage
    await page.evaluate(() => sessionStorage.clear())

    // App should remain interactive after storage clear
    await expect(page.getByRole("button").first()).toBeEnabled()
  })
})

// =============================================================================
// TIMEOUT HANDLING
// =============================================================================

test.describe("Timeout Handling", () => {
  test("handles very slow API response", async ({ page }) => {
    // Delay the response significantly
    await page.route("**/api/v1/entries*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 10000))
      await route.continue()
    })

    await page.goto("/")

    // UI should remain visible and interactive while waiting
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
  })

  test("UI remains responsive during long operations", async ({ page }) => {
    // Delay API responses
    await page.route("**/api/v1/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      await route.continue()
    })

    await page.goto("/")
    // Wait for initial UI to be interactive
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })

    // UI should still respond to interactions
    await page.keyboard.press("Tab")
    await page.keyboard.press("Tab")

    await expect(page.getByRole("button").first()).toBeEnabled()
  })
})

// =============================================================================
// RESOURCE LIMITS
// =============================================================================

test.describe("Resource Limits", () => {
  test("handles large number of entries", async ({ page }) => {
    // Generate 500 mock entries
    const entries = Array.from({ length: 500 }, (_, i) => ({
      id: i + 1,
      title: `Entry ${i + 1}`,
      content: `<p>Content for entry ${i + 1}</p>`,
      feed_id: 1,
      published_at: new Date(Date.now() - i * 3600000).toISOString(),
    }))

    await page.route("**/api/v1/entries*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(entries),
      })
    )

    await page.goto("/")
    // Wait for page to load - app should handle large lists
    await page.waitForLoadState("networkidle")
  })

  test("handles large entry content", async ({ page }) => {
    // Generate very large content
    const largeContent = "<p>" + "Lorem ipsum dolor sit amet. ".repeat(10000) + "</p>"

    await page.route("**/api/v1/entries*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 1,
            title: "Entry with very large content",
            content: largeContent,
            feed_id: 1,
          },
        ]),
      })
    )

    await page.goto("/")
    // Wait for page to load - app should render large content
    await page.waitForLoadState("networkidle")
  })
})

// =============================================================================
// CONSOLE ERRORS
// =============================================================================

test.describe("Console Error Monitoring", () => {
  test("no console errors on normal page load", async ({ page }) => {
    const consoleErrors: string[] = []

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text())
      }
    })

    page.on("pageerror", (error) => {
      consoleErrors.push(error.message)
    })

    await page.goto("/")
    // Wait for app to fully load before checking errors
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })

    // Filter out known acceptable errors (e.g., favicon 404)
    const significantErrors = consoleErrors.filter(
      (err) =>
        !err.includes("favicon") &&
        !err.includes("404") &&
        !err.includes("Failed to load resource")
    )

    // Should have no significant console errors
    expect(significantErrors).toHaveLength(0)
  })

  test("no unhandled promise rejections", async ({ page }) => {
    const rejections: string[] = []

    page.on("pageerror", (error) => {
      if (error.message.includes("Unhandled")) {
        rejections.push(error.message)
      }
    })

    await waitForAppReady(page)

    // Perform some actions
    await page.keyboard.press("j")
    await page.keyboard.press("k")
    await page.keyboard.press("o")

    // Wait for any async operations to complete
    await expect(page.getByRole("button").first()).toBeEnabled()

    expect(rejections).toHaveLength(0)
  })
})
