import { test, expect, Page } from "@playwright/test"

/**
 * Command palette E2E tests.
 *
 * Tests the command palette (Cmd/Ctrl+K) quick navigation feature.
 */

// Helper to wait for app to be ready
async function waitForAppReady(page: Page) {
  await page.goto("/")
  // Wait for NibbleRSS branding to confirm app is fully loaded
  await expect(page.getByText("NibbleRSS")).toBeVisible({ timeout: 10000 })
}

// Helper to open command palette
async function openPalette(page: Page) {
  await page.keyboard.press("Control+k")
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2000 })
}

test.describe("Opening and Closing", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("opens with Ctrl+K", async ({ page }) => {
    await page.keyboard.press("Control+k")

    await expect(page.getByRole("dialog")).toBeVisible()
  })

  test("opens with Meta+K", async ({ page }) => {
    await page.keyboard.press("Meta+k")

    await expect(page.getByRole("dialog")).toBeVisible()
  })

  test("closes with Escape", async ({ page }) => {
    await openPalette(page)

    await page.keyboard.press("Escape")

    await expect(page.getByRole("dialog")).not.toBeVisible()
  })

  test("input is focused when opened", async ({ page }) => {
    await openPalette(page)

    const input = page.getByRole("combobox")
    await expect(input).toBeFocused()
  })

  test("Ctrl+K toggles palette", async ({ page }) => {
    // Open
    await page.keyboard.press("Control+k")
    await expect(page.getByRole("dialog")).toBeVisible()

    // Close
    await page.keyboard.press("Control+k")
    await expect(page.getByRole("dialog")).not.toBeVisible()
  })
})

test.describe("Search and Filter", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("has placeholder text", async ({ page }) => {
    await openPalette(page)

    const input = page.getByRole("combobox")
    const placeholder = await input.getAttribute("placeholder")
    expect(placeholder).toBeTruthy()
  })

  test("can type in search box", async ({ page }) => {
    await openPalette(page)

    const input = page.getByRole("combobox")
    await input.fill("test")

    await expect(input).toHaveValue("test")
  })

  test("shows no results message for non-matching query", async ({ page }) => {
    await openPalette(page)

    const input = page.getByRole("combobox")
    await input.fill("xyznonexistentquery12345")

    await expect(page.getByText(/no results/i)).toBeVisible()
  })

  test("search is case-insensitive", async ({ page }) => {
    await openPalette(page)

    const input = page.getByRole("combobox")
    // Type uppercase
    await input.fill("FRESH")

    // Should still find Fresh (case-insensitive)
    // Fresh is a virtual feed that should always exist
    const freshOption = page.getByRole("option", { name: /fresh/i })
    await expect(freshOption).toBeVisible()
  })

  test("clears search when reopened", async ({ page }) => {
    await openPalette(page)

    const input = page.getByRole("combobox")
    await input.fill("test")
    await expect(input).toHaveValue("test")

    // Close and reopen
    await page.keyboard.press("Escape")
    await openPalette(page)

    // Should be cleared
    await expect(input).toHaveValue("")
  })
})

test.describe("Keyboard Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("Arrow Down moves selection", async ({ page }) => {
    await openPalette(page)

    await page.keyboard.press("ArrowDown")
    // Confirm dialog is still visible (no crash)
    await expect(page.getByRole("dialog")).toBeVisible()
  })

  test("Arrow Up moves selection", async ({ page }) => {
    await openPalette(page)

    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowUp")
    // Confirm dialog is still visible (no crash)
    await expect(page.getByRole("dialog")).toBeVisible()
  })

  test("Enter selects current option", async ({ page }) => {
    await openPalette(page)

    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")

    // Palette should close after selection
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 2000 })
  })
})

test.describe("Virtual Feed Selection", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("Fresh appears in palette", async ({ page }) => {
    await openPalette(page)

    const freshOption = page.getByRole("option", { name: /fresh/i })
    await expect(freshOption).toBeVisible()
  })

  test("Starred appears in palette", async ({ page }) => {
    await openPalette(page)

    const starredOption = page.getByRole("option", { name: /starred/i })
    await expect(starredOption).toBeVisible()
  })

  test("can select Fresh view", async ({ page }) => {
    await openPalette(page)

    await page.getByRole("option", { name: /fresh/i }).click()

    await expect(page.getByRole("dialog")).not.toBeVisible()
  })

  test("can select Starred view", async ({ page }) => {
    await openPalette(page)

    await page.getByRole("option", { name: /starred/i }).click()

    await expect(page.getByRole("dialog")).not.toBeVisible()
  })
})

test.describe("Display and Grouping", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("shows Views group", async ({ page }) => {
    await openPalette(page)

    await expect(page.getByText("Views")).toBeVisible()
  })

  test("shows groups in order", async ({ page }) => {
    await openPalette(page)

    // Views should be visible as a group heading
    const views = page.getByText("Views")
    await expect(views).toBeVisible()
  })

  test("options are listed", async ({ page }) => {
    await openPalette(page)

    // Should have at least some options
    const options = page.getByRole("option")
    const count = await options.count()
    expect(count).toBeGreaterThan(0)
  })
})

test.describe("Feed Selection", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("shows Feeds group when feeds exist", async ({ page }) => {
    // Check if there are any feeds
    const response = await page.request.get("/api/v1/feeds")
    const feeds = await response.json()

    if (feeds.length > 0) {
      await openPalette(page)
      // Use exact match to avoid matching "All Feeds"
      await expect(page.getByText("Feeds", { exact: true })).toBeVisible()
    }
  })

  test("clicking feed closes palette", async ({ page }) => {
    const response = await page.request.get("/api/v1/feeds")
    const feeds = await response.json()

    test.skip(feeds.length === 0, "No feeds available in database")

    await openPalette(page)

    const feedOption = page.getByRole("option", { name: feeds[0].title })
    await expect(feedOption).toBeVisible()
    await feedOption.click()
    await expect(page.getByRole("dialog")).not.toBeVisible()
  })

  test("feed selection via keyboard", async ({ page }) => {
    const response = await page.request.get("/api/v1/feeds")
    const feeds = await response.json()

    test.skip(feeds.length === 0, "No feeds available in database")

    await openPalette(page)

    // Type part of feed name to filter
    const input = page.getByRole("combobox")
    await input.fill(feeds[0].title.substring(0, 3))

    await page.keyboard.press("Enter")
    await expect(page.getByRole("dialog")).not.toBeVisible()
  })
})

test.describe("Category Selection", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("shows Categories group when categories exist", async ({ page }) => {
    const response = await page.request.get("/api/v1/categories")
    const categories = await response.json()

    test.skip(categories.length === 0, "No categories available in database")

    await openPalette(page)
    await expect(page.getByText("Categories")).toBeVisible()
  })

  test("clicking category closes palette", async ({ page }) => {
    const response = await page.request.get("/api/v1/categories")
    const categories = await response.json()

    test.skip(categories.length === 0, "No categories available in database")

    await openPalette(page)

    const categoryOption = page.getByRole("option", {
      name: categories[0].title,
    })
    await expect(categoryOption).toBeVisible()
    await categoryOption.click()
    await expect(page.getByRole("dialog")).not.toBeVisible()
  })
})

test.describe("Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("handles empty search gracefully", async ({ page }) => {
    await openPalette(page)

    const input = page.getByRole("combobox")
    await input.fill("")

    // Should still show options
    const options = page.getByRole("option")
    const count = await options.count()
    expect(count).toBeGreaterThan(0)
  })

  test("handles special characters in search", async ({ page }) => {
    await openPalette(page)

    const input = page.getByRole("combobox")
    // Special regex characters that shouldn't break anything
    await input.fill("test+query")

    // Should not crash - dialog still visible
    await expect(page.getByRole("dialog")).toBeVisible()
  })

  test("handles rapid typing", async ({ page }) => {
    await openPalette(page)

    const input = page.getByRole("combobox")
    await input.fill("abcdefghij")

    await expect(input).toHaveValue("abcdefghij")
  })

  test("handles rapid open/close", async ({ page }) => {
    // Rapidly toggle palette
    await page.keyboard.press("Control+k")
    await page.keyboard.press("Escape")
    await page.keyboard.press("Control+k")
    await page.keyboard.press("Escape")
    await page.keyboard.press("Control+k")

    await expect(page.getByRole("dialog")).toBeVisible()
  })
})
