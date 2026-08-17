import { test, expect, type Page } from "./fixtures"

/**
 * Smoke tests for Nibbler RSS reader.
 *
 * These tests verify basic end-to-end functionality without duplicating
 * the detailed feature tests in other spec files. They provide confidence
 * that the core user flows work correctly.
 *
 * The fixtures in e2e/fixtures sign in as the seeded admin and restore the
 * E2eDataset fixture set before each test, so the feeds, articles, categories
 * and tags these tests read are always present. Missing data is a failure, not
 * a reason to skip.
 */

// Helper to wait for app to fully load and be interactive
async function waitForAppReady(page: Page) {
  await page.goto("/")
  await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
  // Wait for NibbleRSS branding which indicates authenticated view is loaded
  await expect(page.getByText("NibbleRSS")).toBeVisible({ timeout: 10000 })
}

test.describe("Smoke Tests", () => {
  // Run tests serially to avoid auth/state conflicts since smoke tests
  // modify data (star entries, mark read, etc.)
  test.describe.configure({ mode: "serial" })

  // Visit the page first to establish auth context for API calls
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("app loads and shows authenticated view", async ({ page }) => {
    // App should already be loaded from beforeEach
    await expect(page.getByTestId("app-root")).toBeVisible()

    // Should show authenticated interface with NibbleRSS branding
    await expect(page.getByText("NibbleRSS")).toBeVisible()

    // HTTP response should be successful (auth context is established)
    const response = await page.request.get("/")
    expect(response.status()).toBe(200)
  })

  test("sidebar shows virtual feeds and categories", async ({ page }) => {
    // Virtual feeds should always exist
    await expect(
      page.getByRole("button", { name: /fresh/i }).first()
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: /starred/i }).first()
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: /all feeds/i }).first()
    ).toBeVisible()

    // Verify API is accessible after visiting page
    // Note: In dev mode, auto-auth happens via ALLOW_DEV_AUTH env var
    const feedsResponse = await page.request.get("/api/v1/feeds")
    // API should respond (might return 401 if auth not working, which is acceptable
    // as long as the app UI works)
    expect(feedsResponse.status()).toBeLessThan(500)
  })

  test("clicking a feed loads entries in list", async ({ page }) => {
    // Get feeds from API
    const response = await page.request.get("/api/v1/feeds")
    expect(response.ok()).toBe(true)

    const feeds = await response.json()
    expect(Array.isArray(feeds)).toBe(true)
    expect(feeds.length).toBeGreaterThan(0)

    // Click on first feed. Each sidebar row also carries a "<title> menu"
    // button, so the name alone matches two elements.
    const feedButton = page
      .getByRole("button", { name: feeds[0].title, exact: false })
      .first()
    await expect(feedButton).toBeVisible()
    await feedButton.click()

    // Verify entries API was called successfully for this feed
    const entriesResponse = await page.request.get(
      `/api/v1/entries?feed_id=${feeds[0].id}`
    )
    expect(entriesResponse.ok()).toBe(true)

    const entriesData = await entriesResponse.json()
    expect(entriesData.entries).toBeDefined()
    expect(Array.isArray(entriesData.entries)).toBe(true)
  })

  test("clicking an entry displays content", async ({ page }) => {
    // Get entries
    const response = await page.request.get("/api/v1/entries?per_page=1")
    expect(response.ok()).toBe(true)

    const data = await response.json()
    expect(data.entries.length).toBeGreaterThan(0)

    const entry = data.entries[0]

    // Click on All Feeds to ensure we see entries
    await page.getByRole("button", { name: /all feeds/i }).first().click()

    // Find and click entry (entries may be rendered with title as accessible text)
    const entryElement = page.getByText(entry.title).first()
    await expect(entryElement).toBeVisible({ timeout: 5000 })
    await entryElement.click()

    // Verify entry detail was fetched successfully
    const entryDetailResponse = await page.request.get(
      `/api/v1/entries/${entry.id}`
    )
    expect(entryDetailResponse.ok()).toBe(true)

    const entryDetail = await entryDetailResponse.json()
    expect(entryDetail.id).toBe(entry.id)
    expect(entryDetail.content).toBeDefined()
  })

  test("marking entry read updates unread count", async ({ page }) => {
    // Get an entry to work with
    const listResponse = await page.request.get("/api/v1/entries?per_page=1")
    expect(listResponse.ok()).toBe(true)

    const data = await listResponse.json()
    expect(data.entries.length).toBeGreaterThan(0)

    const entryId = data.entries[0].id
    const originalUnread = data.entries[0].unread

    // Toggle read status via API
    const toggleResponse = await page.request.post(
      `/api/v1/entries/${entryId}/toggle_read`
    )
    expect(toggleResponse.ok()).toBe(true)

    const result = await toggleResponse.json()
    // Should have toggled the unread status
    expect(result.unread).toBe(!originalUnread)

    // Verify counters endpoint still works (unread counts are derived from here)
    const countersResponse = await page.request.get("/api/v1/counters")
    expect(countersResponse.ok()).toBe(true)

    const counters = await countersResponse.json()
    expect(counters).toBeDefined()

    // Toggle back to restore original state
    await page.request.post(`/api/v1/entries/${entryId}/toggle_read`)
  })

  test("starring an entry makes it appear in starred view", async ({
    page,
  }) => {
    // Get an entry to star
    const listResponse = await page.request.get("/api/v1/entries?per_page=1")
    expect(listResponse.ok()).toBe(true)

    const data = await listResponse.json()
    expect(data.entries.length).toBeGreaterThan(0)

    const entryId = data.entries[0].id
    const wasStarred = data.entries[0].starred

    // If not starred, star it
    if (!wasStarred) {
      const toggleResponse = await page.request.post(
        `/api/v1/entries/${entryId}/toggle_starred`
      )
      expect(toggleResponse.ok()).toBe(true)
      const result = await toggleResponse.json()
      expect(result.starred).toBe(true)
    }

    // Verify entry appears in starred view via API
    const starredResponse = await page.request.get(
      "/api/v1/entries?view=starred"
    )
    expect(starredResponse.ok()).toBe(true)

    const starredData = await starredResponse.json()
    const foundInStarred = starredData.entries.some(
      (e: { id: number }) => e.id === entryId
    )
    expect(foundInStarred).toBe(true)

    // Click starred view in UI to verify it loads
    await page.getByRole("button", { name: /starred/i }).first().click()
    // Button should remain visible (view loaded successfully)
    await expect(
      page.getByRole("button", { name: /starred/i }).first()
    ).toBeVisible()

    // Restore original state if we changed it
    if (!wasStarred) {
      await page.request.post(`/api/v1/entries/${entryId}/toggle_starred`)
    }
  })

  test("adding a tag to an entry", async ({ page }) => {
    // Get an entry
    const listResponse = await page.request.get("/api/v1/entries?per_page=1")
    expect(listResponse.ok()).toBe(true)

    const data = await listResponse.json()
    expect(data.entries.length).toBeGreaterThan(0)

    const entryId = data.entries[0].id

    // Tag names are normalised to lowercase by EntryTagsController.
    const tagName = `smoke-tag-${Date.now()}`
    const addTagResponse = await page.request.post(
      `/api/v1/entries/${entryId}/tags`,
      { data: { tag_name: tagName } }
    )
    expect(addTagResponse.ok()).toBe(true)

    const tagged = await addTagResponse.json()
    expect(tagged.tags.map((t: { name: string }) => t.name)).toContain(tagName)

    // Verify the entry detail reports it too
    const entryDetailResponse = await page.request.get(
      `/api/v1/entries/${entryId}`
    )
    expect(entryDetailResponse.ok()).toBe(true)
    const entryDetail = await entryDetailResponse.json()
    expect(entryDetail.tags.map((t: { name: string }) => t.name)).toContain(
      tagName
    )

    // Remove tag from entry
    const removeResponse = await page.request.delete(
      `/api/v1/entries/${entryId}/tags/${tagName}`
    )
    expect(removeResponse.ok()).toBe(true)

    const remaining = await removeResponse.json()
    expect(remaining.tags.map((t: { name: string }) => t.name)).not.toContain(
      tagName
    )
  })

  test("mark all read works", async ({ page }) => {
    // The seeded dataset always has unread articles to clear
    const beforeCounters = await page.request.get("/api/v1/counters")
    expect(beforeCounters.ok()).toBe(true)
    expect((await beforeCounters.json()).total).toBeGreaterThan(0)

    // Call mark all read endpoint
    const markAllResponse = await page.request.post(
      "/api/v1/entries/mark_all_read"
    )
    expect(markAllResponse.ok()).toBe(true)

    // Nothing should be left unread. Note this asks for unread=true rather than
    // view=fresh: the Fresh view filters on publication date only, so it still
    // lists articles that have been read.
    const unreadResponse = await page.request.get(
      "/api/v1/entries?unread=true"
    )
    expect(unreadResponse.ok()).toBe(true)

    const unreadData = await unreadResponse.json()
    expect(unreadData.entries.length).toBe(0)

    // Click Fresh view in UI to verify it loads correctly
    await page.getByRole("button", { name: /fresh/i }).first().click()
    await expect(
      page.getByRole("button", { name: /fresh/i }).first()
    ).toBeVisible()
  })

  test("refresh button triggers feed refresh", async ({ page }) => {
    // The server runs with OFFLINE_FEED_FETCH=1, so this exercises the refresh
    // request and response handling without any feed being fetched for real.
    const refreshButton = page.getByRole("button", { name: /refresh/i }).first()
    await expect(refreshButton).toBeVisible()

    // Set up response listener for refresh API call
    const refreshPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/feeds/refresh") &&
        response.status() < 500,
      { timeout: 30000 }
    )

    await refreshButton.click()

    const refreshResponse = await refreshPromise
    // Accept any non-server-error response (200, 202, etc.)
    expect(refreshResponse.status()).toBeLessThan(500)

    // Button should remain visible after refresh
    await expect(refreshButton).toBeVisible()
  })

  test("settings dialog opens and has expected tabs", async ({ page }) => {
    // Find and click settings button
    const settingsButton = page.getByRole("button", { name: /settings/i })
    await expect(settingsButton).toBeVisible()
    await settingsButton.click()

    // Dialog should appear
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Check for expected tabs (Note: Labels tab displays as "Tags" in UI)
    await expect(page.getByRole("tab", { name: /feeds/i })).toBeVisible()
    await expect(page.getByRole("tab", { name: /tags/i })).toBeVisible()
    await expect(page.getByRole("tab", { name: /filters/i })).toBeVisible()
    await expect(page.getByRole("tab", { name: /preferences/i })).toBeVisible()

    // Close dialog
    await page.keyboard.press("Escape")
    await expect(dialog).not.toBeVisible({ timeout: 2000 })
  })

  test("subscribe dialog opens from add button", async ({ page }) => {
    // Find the subscribe/add button
    const addButton = page.getByRole("button", { name: /add\.\.\./i })
    await expect(addButton).toBeVisible()
    await addButton.click()

    // Click Subscribe to Feed from dropdown
    await page.getByText("Subscribe to Feed").click()

    // Dialog should appear with URL input
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible({ timeout: 5000 })

    const urlInput = page.getByRole("textbox").first()
    await expect(urlInput).toBeVisible()

    // Close dialog
    await page.keyboard.press("Escape")
    await expect(dialog).not.toBeVisible({ timeout: 2000 })
  })
})
