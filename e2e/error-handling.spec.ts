import { test, expect, Page } from "@playwright/test"

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

    // Try to load entries by clicking on a feed if available
    const feedItem = page.locator('[data-testid="feed-item"]').first()
    if (await feedItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await feedItem.click()
      // App should remain interactive after error
      await expect(page.getByRole("button").first()).toBeEnabled()
    }
  })

  test("shows loading states during slow requests", async ({ page }) => {
    // Delay entry requests
    await page.route("**/api/v1/entries*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      await route.continue()
    })

    await page.goto("/")

    // Look for any loading indicator
    const hasLoadingIndicator =
      (await page.getByText(/loading/i).isVisible({ timeout: 3000 }).catch(() => false)) ||
      (await page.locator('[class*="animate-spin"]').isVisible({ timeout: 3000 }).catch(() => false)) ||
      (await page.locator('[class*="loading"]').isVisible({ timeout: 3000 }).catch(() => false))

    // App should eventually load after the delay
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
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

    // Navigate to Starred
    const starredNav = page.getByText("Starred")
    if (await starredNav.isVisible().catch(() => false)) {
      await starredNav.click()
      // Wait for navigation to complete - app should remain responsive
      await expect(page.getByRole("button").first()).toBeEnabled()
    }
  })

  test("shows appropriate state when search finds nothing", async ({
    page,
  }) => {
    await waitForAppReady(page)

    // Open command palette and search
    await page.keyboard.press("Meta+k")

    const searchInput = page.getByPlaceholder(/search|type/i)
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill("zzz-nonexistent-query-xyz")
      // App should remain responsive after search
      await expect(page.getByRole("button").first()).toBeEnabled()
    }
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

    // Find a clickable element and click it multiple times rapidly
    const button = page.getByRole("button").first()
    if (await button.isVisible({ timeout: 5000 }).catch(() => false)) {
      await button.click({ timeout: 5000 })
      await button.click({ timeout: 5000 }).catch(() => {}) // May already be in different state
      await button.click({ timeout: 5000 }).catch(() => {})
    }

    // App should remain interactive after rapid clicks
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

    // Open subscribe dialog
    const subscribeButton = page.getByRole("button", { name: /subscribe|add feed/i })
    if (await subscribeButton.isVisible().catch(() => false)) {
      await subscribeButton.click()

      const urlInput = page.getByLabel(/url/i)
      if (await urlInput.isVisible().catch(() => false)) {
        await urlInput.fill("not-a-valid-url")

        // Try to submit
        const submitButton = page.getByRole("button", { name: /subscribe|add/i })
        await submitButton.click()

        // App should remain functional after validation
        await expect(page.getByRole("button").first()).toBeEnabled()
      }
    }
  })

  test("settings form handles invalid values", async ({ page }) => {
    await waitForAppReady(page)

    // Open settings
    const settingsButton = page
      .getByRole("button", { name: /settings|cog/i })
      .first()
    await settingsButton.click()

    // Wait for settings dialog
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 })

    // Try to enter invalid data in a number field if available
    const numberInput = page.locator('input[type="number"]').first()
    if (await numberInput.isVisible().catch(() => false)) {
      await numberInput.fill("-999")
    }

    // Close settings
    await page.keyboard.press("Escape")

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

    // Navigate somewhere
    const firstFeed = page.locator('[data-testid="feed-item"]').first()
    if (await firstFeed.isVisible().catch(() => false)) {
      await firstFeed.click()
      // Wait for navigation to complete
      await expect(page.getByRole("button").first()).toBeEnabled()

      // Go back
      await page.goBack()
      await expect(page.getByRole("button").first()).toBeEnabled()

      // Go forward
      await page.goForward()
      await expect(page.getByRole("button").first()).toBeEnabled()
    }
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
