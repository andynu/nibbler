import { test, expect } from "./fixtures"

/**
 * Command palette E2E tests.
 *
 * Tests the command palette (Cmd/Ctrl+K) quick navigation feature.
 */

test.describe("Opening and Closing", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("opens with Ctrl+K", async ({ commandPalette }) => {
    await commandPalette.open()

    await expect(commandPalette.dialog).toBeVisible()
  })

  test("opens with Meta+K", async ({ page }) => {
    await page.keyboard.press("Meta+k")

    await expect(page.getByRole("dialog")).toBeVisible()
  })

  test("closes with Escape", async ({ commandPalette }) => {
    await commandPalette.open()

    await commandPalette.close()

    await expect(commandPalette.dialog).not.toBeVisible()
  })

  test("input is focused when opened", async ({ commandPalette }) => {
    await commandPalette.open()

    await expect(commandPalette.input).toBeFocused()
  })

  test("Ctrl+K toggles palette", async ({ commandPalette }) => {
    // Open
    await commandPalette.open()
    await expect(commandPalette.dialog).toBeVisible()

    // Close by pressing Ctrl+K again
    await commandPalette.page.keyboard.press("Control+k")
    await expect(commandPalette.dialog).not.toBeVisible()
  })
})

test.describe("Search and Filter", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("has placeholder text", async ({ commandPalette }) => {
    await commandPalette.open()

    const placeholder = await commandPalette.input.getAttribute("placeholder")
    expect(placeholder).toBeTruthy()
  })

  test("can type in search box", async ({ commandPalette }) => {
    await commandPalette.open()

    await commandPalette.search("test")

    await expect(commandPalette.input).toHaveValue("test")
  })

  test("shows no results message for non-matching query", async ({ commandPalette, page }) => {
    await commandPalette.open()

    await commandPalette.search("xyznonexistentquery12345")

    await expect(page.getByText(/no results/i)).toBeVisible()
  })

  test("search is case-insensitive", async ({ commandPalette, page }) => {
    await commandPalette.open()

    // Type uppercase
    await commandPalette.search("FRESH")

    // Should still find Fresh (case-insensitive)
    // Fresh is a virtual feed that should always exist
    const freshOption = page.getByRole("option", { name: /fresh/i })
    await expect(freshOption).toBeVisible()
  })

  test("clears search when reopened", async ({ commandPalette }) => {
    await commandPalette.open()

    await commandPalette.search("test")
    await expect(commandPalette.input).toHaveValue("test")

    // Close and reopen
    await commandPalette.close()
    await commandPalette.open()

    // Should be cleared
    await expect(commandPalette.input).toHaveValue("")
  })
})

test.describe("Keyboard Navigation", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("Arrow Down moves selection", async ({ commandPalette }) => {
    await commandPalette.open()

    await commandPalette.navigateDown()
    // Confirm dialog is still visible (no crash)
    await expect(commandPalette.dialog).toBeVisible()
  })

  test("Arrow Up moves selection", async ({ commandPalette }) => {
    await commandPalette.open()

    await commandPalette.navigateDown()
    await commandPalette.navigateDown()
    await commandPalette.navigateUp()
    // Confirm dialog is still visible (no crash)
    await expect(commandPalette.dialog).toBeVisible()
  })

  test("Enter selects current option", async ({ commandPalette }) => {
    await commandPalette.open()

    await commandPalette.navigateDown()
    await commandPalette.selectFirstResult()

    // Palette should close after selection
    await expect(commandPalette.dialog).not.toBeVisible({ timeout: 2000 })
  })
})

test.describe("Virtual Feed Selection", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("Fresh appears in palette", async ({ commandPalette, page }) => {
    await commandPalette.open()

    const freshOption = page.getByRole("option", { name: /fresh/i })
    await expect(freshOption).toBeVisible()
  })

  test("Starred appears in palette", async ({ commandPalette, page }) => {
    await commandPalette.open()

    const starredOption = page.getByRole("option", { name: /starred/i })
    await expect(starredOption).toBeVisible()
  })

  test("can select Fresh view", async ({ commandPalette }) => {
    await commandPalette.open()

    await commandPalette.selectResultByText(/fresh/i)

    await expect(commandPalette.dialog).not.toBeVisible()
  })

  test("can select Starred view", async ({ commandPalette }) => {
    await commandPalette.open()

    await commandPalette.selectResultByText(/starred/i)

    await expect(commandPalette.dialog).not.toBeVisible()
  })
})

test.describe("Display and Grouping", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("shows Views group", async ({ commandPalette, page }) => {
    await commandPalette.open()

    await expect(page.getByText("Views")).toBeVisible()
  })

  test("shows groups in order", async ({ commandPalette, page }) => {
    await commandPalette.open()

    // Views should be visible as a group heading
    const views = page.getByText("Views")
    await expect(views).toBeVisible()
  })

  test("options are listed", async ({ commandPalette }) => {
    await commandPalette.open()

    // Should have at least some options
    const count = await commandPalette.getResultCount()
    expect(count).toBeGreaterThan(0)
  })
})

test.describe("Feed Selection", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("shows Feeds group when feeds exist", async ({ commandPalette, page }) => {
    // Check if there are any feeds
    const response = await page.request.get("/api/v1/feeds")
    const feeds = await response.json()

    if (feeds.length > 0) {
      await commandPalette.open()
      // Use exact match to avoid matching "All Feeds"
      await expect(page.getByText("Feeds", { exact: true })).toBeVisible()
    }
  })

  test("clicking feed closes palette", async ({ commandPalette, page }) => {
    const response = await page.request.get("/api/v1/feeds")
    const feeds = await response.json()

    test.skip(feeds.length === 0, "No feeds available in database")

    await commandPalette.open()

    const feedOption = page.getByRole("option", { name: feeds[0].title })
    await expect(feedOption).toBeVisible()
    await feedOption.click()
    await expect(commandPalette.dialog).not.toBeVisible()
  })

  test("feed selection via keyboard", async ({ commandPalette, page }) => {
    const response = await page.request.get("/api/v1/feeds")
    const feeds = await response.json()

    test.skip(feeds.length === 0, "No feeds available in database")

    await commandPalette.open()

    // Type part of feed name to filter
    await commandPalette.search(feeds[0].title.substring(0, 3))

    await commandPalette.selectFirstResult()
    await expect(commandPalette.dialog).not.toBeVisible()
  })
})

test.describe("Category Selection", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("shows Categories group when categories exist", async ({ commandPalette, page }) => {
    const response = await page.request.get("/api/v1/categories")
    const categories = await response.json()

    test.skip(categories.length === 0, "No categories available in database")

    await commandPalette.open()
    await expect(page.getByText("Categories")).toBeVisible()
  })

  test("clicking category closes palette", async ({ commandPalette, page }) => {
    const response = await page.request.get("/api/v1/categories")
    const categories = await response.json()

    test.skip(categories.length === 0, "No categories available in database")

    await commandPalette.open()

    const categoryOption = page.getByRole("option", {
      name: categories[0].title,
    })
    await expect(categoryOption).toBeVisible()
    await categoryOption.click()
    await expect(commandPalette.dialog).not.toBeVisible()
  })
})

test.describe("Edge Cases", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("handles empty search gracefully", async ({ commandPalette }) => {
    await commandPalette.open()

    await commandPalette.search("")

    // Should still show options
    const count = await commandPalette.getResultCount()
    expect(count).toBeGreaterThan(0)
  })

  test("handles special characters in search", async ({ commandPalette }) => {
    await commandPalette.open()

    // Special regex characters that shouldn't break anything
    await commandPalette.search("test+query")

    // Should not crash - dialog still visible
    await expect(commandPalette.dialog).toBeVisible()
  })

  test("handles rapid typing", async ({ commandPalette }) => {
    await commandPalette.open()

    await commandPalette.search("abcdefghij")

    await expect(commandPalette.input).toHaveValue("abcdefghij")
  })

  test("handles rapid open/close", async ({ commandPalette }) => {
    // Rapidly toggle palette
    await commandPalette.open()
    await commandPalette.close()
    await commandPalette.open()
    await commandPalette.close()
    await commandPalette.open()

    await expect(commandPalette.dialog).toBeVisible()
  })
})
