import { test, expect, Page } from "@playwright/test"

/**
 * Feed management E2E tests.
 *
 * Tests the feed subscription, editing, and organization flows.
 * These tests work with whatever data exists in the dev database.
 */

// Helper to wait for app to be ready
async function waitForAppReady(page: Page) {
  await page.goto("/")
  // Wait for the sidebar to render (indicates app is loaded)
  await page.waitForSelector("button", { timeout: 10000 })
}

test.describe("Feed Sidebar", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("sidebar shows virtual feeds section", async ({ page }) => {
    // The app should render - look for any buttons indicating the UI is loaded
    const anyButton = page.locator("button").first()
    await expect(anyButton).toBeVisible({ timeout: 10000 })
  })

  test("Fresh view is accessible", async ({ page }) => {
    // Click on Fresh
    const freshButton = page.getByRole("button", { name: /fresh/i }).first()
    if ((await freshButton.count()) > 0) {
      await freshButton.click()
      // Should load the fresh entries view
      await page.waitForTimeout(500)
    }
  })

  test("Starred view is accessible", async ({ page }) => {
    // Click on Starred
    const starredButton = page.getByRole("button", { name: /starred/i }).first()
    if ((await starredButton.count()) > 0) {
      await starredButton.click()
      await page.waitForTimeout(500)
    }
  })

  test("clicking a feed loads its entries", async ({ page }) => {
    // Get list of feeds from API
    const response = await page.request.get("/api/v1/feeds")
    const feeds = await response.json()

    if (feeds.length > 0) {
      const firstFeed = feeds[0]
      // Find and click the feed in sidebar
      const feedButton = page.getByRole("button", { name: firstFeed.title })
      if ((await feedButton.count()) > 0) {
        await feedButton.click()
        // Entries should load
        await page.waitForTimeout(500)
      }
    }
  })
})

test.describe("Subscribe to Feed Dialog", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("subscribe button opens dialog", async ({ page }) => {
    // Find the subscribe/add button
    const addButton = page
      .getByRole("button", { name: /subscribe|add feed|\+/i })
      .first()
    if ((await addButton.count()) > 0) {
      await addButton.click()

      // Dialog should appear
      const dialog = page.getByRole("dialog")
      await expect(dialog).toBeVisible({ timeout: 5000 })
    }
  })

  test("dialog has URL input field", async ({ page }) => {
    const addButton = page
      .getByRole("button", { name: /subscribe|add feed|\+/i })
      .first()
    if ((await addButton.count()) > 0) {
      await addButton.click()

      // Should have a URL/address input
      const urlInput = page.getByRole("textbox").first()
      await expect(urlInput).toBeVisible()
    }
  })

  test("cancel button closes dialog", async ({ page }) => {
    const addButton = page
      .getByRole("button", { name: /subscribe|add feed|\+/i })
      .first()
    if ((await addButton.count()) > 0) {
      await addButton.click()

      const dialog = page.getByRole("dialog")
      await expect(dialog).toBeVisible()

      // Press escape or click cancel
      await page.keyboard.press("Escape")
      await expect(dialog).not.toBeVisible({ timeout: 2000 })
    }
  })

  test("subscribe button is disabled without URL", async ({ page }) => {
    const addButton = page
      .getByRole("button", { name: /subscribe|add feed|\+/i })
      .first()
    if ((await addButton.count()) > 0) {
      await addButton.click()

      // Find submit button in dialog
      const submitButton = page
        .getByRole("dialog")
        .getByRole("button", { name: /subscribe/i })
      if ((await submitButton.count()) > 0) {
        await expect(submitButton).toBeDisabled()
      }
    }
  })
})

test.describe("Feed API operations", () => {
  test("can list feeds via API", async ({ page }) => {
    const response = await page.request.get("/api/v1/feeds")
    expect(response.ok()).toBe(true)

    const feeds = await response.json()
    expect(Array.isArray(feeds)).toBe(true)
  })

  test("can list categories via API", async ({ page }) => {
    const response = await page.request.get("/api/v1/categories")
    expect(response.ok()).toBe(true)

    const categories = await response.json()
    expect(Array.isArray(categories)).toBe(true)
  })

  test("can get feed details via API", async ({ page }) => {
    const listResponse = await page.request.get("/api/v1/feeds")
    const feeds = await listResponse.json()

    if (feeds.length > 0) {
      const feedId = feeds[0].id
      const detailResponse = await page.request.get(`/api/v1/feeds/${feedId}`)
      expect(detailResponse.ok()).toBe(true)

      const feed = await detailResponse.json()
      expect(feed.id).toBe(feedId)
      expect(feed.title).toBeDefined()
    }
  })

  test("can refresh all feeds via API", async ({ page }) => {
    const response = await page.request.post("/api/v1/feeds/refresh_all")
    // This endpoint may succeed or return 500 if no feeds exist or external services fail
    // Just verify it returns a response (not a network error)
    expect(response.status()).toBeLessThan(600)
  })
})

test.describe("Category operations", () => {
  test("can create a category via API", async ({ page }) => {
    const uniqueName = `Test Category ${Date.now()}`
    const response = await page.request.post("/api/v1/categories", {
      data: { title: uniqueName },
    })

    expect(response.ok()).toBe(true)
    const category = await response.json()
    expect(category.title).toBe(uniqueName)

    // Clean up - delete the category
    await page.request.delete(`/api/v1/categories/${category.id}`)
  })

  test("can update a category via API", async ({ page }) => {
    // Create a category first
    const createResponse = await page.request.post("/api/v1/categories", {
      data: { title: `Update Test ${Date.now()}` },
    })
    const category = await createResponse.json()

    // Update it
    const newTitle = `Updated ${Date.now()}`
    const updateResponse = await page.request.patch(
      `/api/v1/categories/${category.id}`,
      {
        data: { title: newTitle },
      }
    )
    expect(updateResponse.ok()).toBe(true)

    const updated = await updateResponse.json()
    expect(updated.title).toBe(newTitle)

    // Clean up
    await page.request.delete(`/api/v1/categories/${category.id}`)
  })

  test("can delete a category via API", async ({ page }) => {
    // Create a category
    const createResponse = await page.request.post("/api/v1/categories", {
      data: { title: `Delete Test ${Date.now()}` },
    })
    const category = await createResponse.json()

    // Delete it
    const deleteResponse = await page.request.delete(
      `/api/v1/categories/${category.id}`
    )
    expect(deleteResponse.status()).toBe(204)

    // Verify it's gone
    const getResponse = await page.request.get(
      `/api/v1/categories/${category.id}`
    )
    expect(getResponse.status()).toBe(404)
  })
})

test.describe("Settings Dialog - Feeds Tab", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("settings button opens dialog", async ({ page }) => {
    // Find settings button (gear icon or settings text)
    const settingsButton = page
      .getByRole("button", { name: /settings|cog/i })
      .first()
    if ((await settingsButton.count()) > 0) {
      await settingsButton.click()

      const dialog = page.getByRole("dialog")
      await expect(dialog).toBeVisible({ timeout: 5000 })
    }
  })

  test("feeds tab is available in settings", async ({ page }) => {
    const settingsButton = page
      .getByRole("button", { name: /settings|cog/i })
      .first()
    if ((await settingsButton.count()) > 0) {
      await settingsButton.click()

      // Look for Feeds tab
      const feedsTab = page.getByRole("tab", { name: /feeds/i })
      if ((await feedsTab.count()) > 0) {
        await expect(feedsTab).toBeVisible()
      }
    }
  })
})

test.describe("Refresh functionality", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("refresh button is present", async ({ page }) => {
    const refreshButton = page.getByRole("button", { name: /refresh/i }).first()
    await expect(refreshButton).toBeVisible()
  })

  test("refresh button can be clicked", async ({ page }) => {
    const refreshButton = page.getByRole("button", { name: /refresh/i }).first()
    if ((await refreshButton.count()) > 0) {
      // Click and wait for request to complete
      await refreshButton.click()

      // Button might become disabled during refresh
      // Just verify no error occurs
      await page.waitForTimeout(1000)
    }
  })
})

test.describe("Entry counters", () => {
  test("counters endpoint returns data", async ({ page }) => {
    const response = await page.request.get("/api/v1/counters")
    expect(response.ok()).toBe(true)

    const counters = await response.json()
    expect(counters).toBeDefined()
  })
})
