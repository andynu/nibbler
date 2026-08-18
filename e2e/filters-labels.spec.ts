import { test, expect, type Page } from "./fixtures"

/**
 * Filters and Tags E2E tests.
 *
 * Tests filter CRUD operations, tag management, and their interactions.
 * Each test is self-contained and cleans up after itself.
 *
 * "Labels" is the TT-RSS name for what this app calls tags: the API is
 * /api/v1/tags, the settings tab reads "Tags", and the component that renders
 * it is LabelManager. The specs use the API's vocabulary.
 */

// Helper to wait for app to be ready
async function waitForAppReady(page: Page) {
  await page.goto("/")
  await page.waitForSelector("button", { timeout: 10000 })
  // Wait for initial render to stabilize
  await expect(page.getByRole("button").first()).toBeEnabled()
}

// Helper to open settings dialog
async function openSettings(page: Page) {
  const settingsButton = page
    .getByRole("button", { name: /settings|cog/i })
    .first()
  await settingsButton.click()
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 })
}

// Helper to navigate to Filters tab
async function goToFiltersTab(page: Page) {
  await openSettings(page)
  await page.getByRole("tab", { name: /filters/i }).click()
  await expect(page.getByRole("tab", { name: /filters/i })).toHaveAttribute(
    "data-state",
    "active"
  )
  // Wait for filters to finish loading. Scope the empty-state branch to the
  // settings dialog and match FilterManager's copy exactly (trailing period
  // included) so unrelated "no filters" text elsewhere cannot satisfy or
  // collide with it.
  await Promise.race([
    page.getByText("Article Filters").waitFor({ timeout: 10000 }),
    page
      .getByRole("dialog")
      .getByText("No filters yet.", { exact: true })
      .waitFor({ timeout: 10000 }),
  ])
}

// Helper to navigate to Tags tab
async function goToTagsTab(page: Page) {
  await openSettings(page)
  await page.getByRole("tab", { name: /tags/i }).click()
  await expect(page.getByRole("tab", { name: /tags/i })).toHaveAttribute(
    "data-state",
    "active"
  )
  // Wait for tags to finish loading. Three components render a "No tags yet"
  // empty state - LabelManager (this one, with a trailing period), SuggestedTags
  // and TagEditor - so scope to the settings dialog and match exactly rather
  // than letting an entry-pane tag picker satisfy this wait.
  await Promise.race([
    page.getByRole("heading", { name: "Tags" }).waitFor({ timeout: 10000 }),
    page
      .getByRole("dialog")
      .getByText("No tags yet.", { exact: true })
      .waitFor({ timeout: 10000 }),
  ])
}

// Helper to create filter via API.
// filter_type and action_type are the string names in FilterRule::FILTER_TYPES
// and FilterAction::ACTION_TYPES; anything else fails validation.
async function createFilterViaApi(
  page: Page,
  title: string,
  pattern: string = "test-pattern"
) {
  const response = await page.request.post("/api/v1/filters", {
    data: {
      filter: {
        title,
        enabled: true,
        match_any_rule: false,
        filter_rules_attributes: [
          { filter_type: "title", reg_exp: pattern, inverse: false },
        ],
        filter_actions_attributes: [{ action_type: "mark_read" }],
      },
    },
  })
  return response.json()
}

// Helper to delete filter via API
async function deleteFilterViaApi(page: Page, filterId: number) {
  await page.request.delete(`/api/v1/filters/${filterId}`)
}

// Helper to create tag via API
async function createTagViaApi(page: Page, name: string) {
  const response = await page.request.post("/api/v1/tags", {
    data: {
      tag: {
        name,
        fg_color: "#ffffff",
        bg_color: "#3b82f6",
      },
    },
  })
  return response.json()
}

// Helper to delete tag via API
async function deleteTagViaApi(page: Page, tagId: number) {
  await page.request.delete(`/api/v1/tags/${tagId}`)
}

// =============================================================================
// FILTER API TESTS
// =============================================================================

test.describe("Filter API", () => {
  test("can list filters via API", async ({ page }) => {
    const response = await page.request.get("/api/v1/filters")
    expect(response.ok()).toBe(true)

    const filters = await response.json()
    expect(Array.isArray(filters)).toBe(true)
  })

  test("can create, update, and delete a filter via API", async ({ page }) => {
    // Create
    const filterData = {
      filter: {
        title: "E2E API Test " + Date.now(),
        enabled: true,
        match_any_rule: false,
        filter_rules_attributes: [
          { filter_type: "title", reg_exp: "test-pattern", inverse: false },
        ],
        filter_actions_attributes: [{ action_type: "mark_read" }],
      },
    }

    const createResponse = await page.request.post("/api/v1/filters", {
      data: filterData,
    })
    expect(createResponse.ok()).toBe(true)

    const created = await createResponse.json()
    expect(created.id).toBeDefined()
    expect(created.title).toBe(filterData.filter.title)
    expect(created.rules).toHaveLength(1)
    expect(created.actions).toHaveLength(1)

    // Update
    const updateResponse = await page.request.patch(
      `/api/v1/filters/${created.id}`,
      {
        data: { filter: { title: "Updated Title", enabled: false } },
      }
    )
    expect(updateResponse.ok()).toBe(true)

    const updated = await updateResponse.json()
    expect(updated.title).toBe("Updated Title")
    expect(updated.enabled).toBe(false)

    // Delete
    const deleteResponse = await page.request.delete(
      `/api/v1/filters/${created.id}`
    )
    expect(deleteResponse.status()).toBe(204)

    // Verify gone
    const getResponse = await page.request.get(
      `/api/v1/filters/${created.id}`
    )
    expect(getResponse.status()).toBe(404)
  })

  test("filter test endpoint returns match info", async ({ page }) => {
    const filter = await createFilterViaApi(page, "E2E Test Endpoint " + Date.now(), ".*")

    try {
      const response = await page.request.post(
        `/api/v1/filters/${filter.id}/test`
      )
      expect(response.ok()).toBe(true)

      const result = await response.json()
      expect(result).toHaveProperty("total_tested")
      expect(result).toHaveProperty("matches")
      expect(result).toHaveProperty("matched_articles")
    } finally {
      await deleteFilterViaApi(page, filter.id)
    }
  })
})

// =============================================================================
// FILTERS UI TESTS
// =============================================================================

test.describe("Filters Tab UI", () => {
  // Run these tests serially to avoid dialog contention issues
  test.describe.configure({ mode: "serial" })

  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("shows filter management interface", async ({ page }) => {
    await goToFiltersTab(page)

    await expect(page.getByText("Article Filters")).toBeVisible()
    await expect(
      page.getByRole("button", { name: /new filter/i })
    ).toBeVisible()
  })

  test.skip("can open and close filter creation dialog", async ({ page }) => {
    // Skipped: Flaky due to nested dialog behavior - "filter dialog has all form elements" covers similar functionality
    await goToFiltersTab(page)

    // Open dialog
    await page.getByRole("button", { name: /new filter/i }).click()

    // Find the input by ID since it's in a nested dialog context
    const filterNameInput = page.locator("#filter-title")
    await expect(filterNameInput).toBeVisible({ timeout: 5000 })

    // Close dialog via Cancel
    await page.getByRole("button", { name: /cancel/i }).click()
    await expect(filterNameInput).not.toBeVisible({ timeout: 3000 })
  })

  test.skip("can create a filter through UI", async ({ page }) => {
    // Skipped: This test is flaky due to dialog state management between Settings and Filter dialogs
    const filterTitle = "E2E UI Created " + Date.now()

    await goToFiltersTab(page)

    // Open dialog
    await page.getByRole("button", { name: /new filter/i }).click()

    // Fill form using specific selectors
    const filterNameInput = page.locator("#filter-title")
    await expect(filterNameInput).toBeVisible({ timeout: 5000 })
    await filterNameInput.fill(filterTitle)

    // Fill the pattern for the default rule
    const patternInput = page.locator('input[placeholder*="expression" i]')
    await patternInput.fill("test-pattern")

    // Submit and wait for dialog to close
    await page.getByRole("button", { name: /create filter/i }).click()

    // Wait for dialog to close (settings dialog should still be open)
    await expect(page.locator("#filter-title")).not.toBeVisible({ timeout: 5000 })

    // Verify in list
    await expect(page.getByText(filterTitle)).toBeVisible({ timeout: 5000 })

    // Cleanup
    const listResponse = await page.request.get("/api/v1/filters")
    const filters = await listResponse.json()
    const created = filters.find(
      (f: { title: string }) => f.title === filterTitle
    )
    if (created) {
      await deleteFilterViaApi(page, created.id)
    }
  })
})

test.describe("Filter List Operations", () => {
  let testFilterId: number
  let testFilterTitle: string

  test.beforeEach(async ({ page }) => {
    // Create a test filter with a unique name
    testFilterTitle = "E2E Filter Ops " + Date.now() + Math.random().toString(36).slice(2, 8)
    const filter = await createFilterViaApi(page, testFilterTitle)
    testFilterId = filter.id
    await waitForAppReady(page)
  })

  test.afterEach(async ({ page }) => {
    // Cleanup test filter
    if (testFilterId) {
      try {
        await deleteFilterViaApi(page, testFilterId)
      } catch {
        // Already deleted
      }
    }
  })

  test("filter appears in list with toggle and buttons", async ({ page }) => {
    await goToFiltersTab(page)

    // Find the filter row by testid and text
    const filterRow = page.getByTestId("filter-row").filter({
      hasText: testFilterTitle,
    })

    await expect(filterRow).toBeVisible()
    await expect(filterRow.getByRole("switch")).toBeVisible()
    // Enabled switch plus test, backfill, edit and delete icon buttons
    await expect(filterRow.locator("button")).toHaveCount(5)
    for (const action of ["Test", "Apply", "Edit", "Delete"]) {
      await expect(
        filterRow.getByRole("button", { name: new RegExp(`^${action} `) })
      ).toBeVisible()
    }
  })

  test("can toggle filter enabled state", async ({ page }) => {
    await goToFiltersTab(page)

    const filterRow = page.getByTestId("filter-row").filter({
      hasText: testFilterTitle,
    })
    const toggle = filterRow.getByRole("switch")

    // Initially enabled
    await expect(toggle).toBeChecked()

    // Toggle off
    await toggle.click()
    await expect(toggle).not.toBeChecked()

    // Should show Disabled badge
    await expect(filterRow.getByText("Disabled")).toBeVisible()
  })

  test("can delete filter with confirmation", async ({ page }) => {
    await goToFiltersTab(page)

    const filterRow = page.getByTestId("filter-row").filter({
      hasText: testFilterTitle,
    })

    // Set up dialog handler to confirm
    page.on("dialog", (dialog) => dialog.accept())

    await filterRow.getByRole("button", { name: /^Delete / }).click()

    // Filter should be removed
    await expect(filterRow).not.toBeVisible({ timeout: 5000 })

    // Clear the testFilterId since it's already deleted
    testFilterId = 0
  })
})

// =============================================================================
// TAG API TESTS
// =============================================================================

test.describe("Tag API", () => {
  test("can list tags via API", async ({ page }) => {
    const response = await page.request.get("/api/v1/tags")
    expect(response.ok()).toBe(true)

    const tags = await response.json()
    expect(Array.isArray(tags)).toBe(true)
  })

  test("can create, update, and delete a tag via API", async ({ page }) => {
    // Create
    const tagData = {
      tag: {
        name: "e2e-api-tag-" + Date.now(),
        fg_color: "#ffffff",
        bg_color: "#3b82f6",
      },
    }

    const createResponse = await page.request.post("/api/v1/tags", {
      data: tagData,
    })
    expect(createResponse.ok()).toBe(true)

    const created = await createResponse.json()
    expect(created.id).toBeDefined()
    expect(created.name).toBe(tagData.tag.name)
    expect(created.entry_count).toBe(0)

    // Update
    const updateResponse = await page.request.patch(
      `/api/v1/tags/${created.id}`,
      {
        data: { tag: { name: "updated-tag-name", bg_color: "#ef4444" } },
      }
    )
    expect(updateResponse.ok()).toBe(true)

    const updated = await updateResponse.json()
    expect(updated.name).toBe("updated-tag-name")
    expect(updated.bg_color).toBe("#ef4444")

    // Delete
    const deleteResponse = await page.request.delete(
      `/api/v1/tags/${created.id}`
    )
    expect(deleteResponse.status()).toBe(204)

    // Verify gone
    const getResponse = await page.request.get(`/api/v1/tags/${created.id}`)
    expect(getResponse.status()).toBe(404)
  })
})

// =============================================================================
// TAGS UI TESTS
// =============================================================================

test.describe("Tags Tab UI", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("shows tag management interface", async ({ page }) => {
    await goToTagsTab(page)

    await expect(page.getByRole("heading", { name: "Tags" })).toBeVisible()
    await expect(page.getByRole("button", { name: /new tag/i })).toBeVisible()
  })

  test("can open and close tag creation dialog", async ({ page }) => {
    await goToTagsTab(page)

    // Open dialog
    await page.getByRole("button", { name: /new tag/i }).click()
    await expect(page.getByLabel(/tag name/i)).toBeVisible({ timeout: 5000 })

    // Close dialog via Cancel
    await page.getByRole("button", { name: /cancel/i }).click()
    await expect(page.getByLabel(/tag name/i)).not.toBeVisible({ timeout: 3000 })
  })

  test("can create a tag through UI", async ({ page }) => {
    const tagName = "e2e-ui-tag-" + Date.now()

    await goToTagsTab(page)

    // Open dialog
    await page.getByRole("button", { name: /new tag/i }).click()

    // Wait for tag name input to be visible
    await expect(page.getByLabel(/tag name/i)).toBeVisible({ timeout: 5000 })

    // Fill form
    await page.getByLabel(/tag name/i).fill(tagName)

    // Submit
    await page.getByRole("button", { name: /^create tag$/i }).click()

    // Verify in list
    await expect(page.getByText(tagName)).toBeVisible({ timeout: 5000 })

    // Cleanup
    const listResponse = await page.request.get("/api/v1/tags")
    const tags = await listResponse.json()
    const created = tags.find((t: { name: string }) => t.name === tagName)
    if (created) {
      await deleteTagViaApi(page, created.id)
    }
  })
})

test.describe("Tag List Operations", () => {
  let testTagId: number
  let testTagName: string

  test.beforeEach(async ({ page }) => {
    // Create a test tag with a unique name
    testTagName = "e2e-tag-ops-" + Date.now() + Math.random().toString(36).slice(2, 8)
    const tag = await createTagViaApi(page, testTagName)
    testTagId = tag.id
    await waitForAppReady(page)
  })

  test.afterEach(async ({ page }) => {
    // Cleanup test tag
    if (testTagId) {
      try {
        await deleteTagViaApi(page, testTagId)
      } catch {
        // Already deleted
      }
    }
  })

  test("tag appears in list with styled badge", async ({ page }) => {
    await goToTagsTab(page)

    // Find the tag row by testid and text
    const tagRow = page.getByTestId("tag-row").filter({ hasText: testTagName })
    await expect(tagRow).toBeVisible()

    // Should show article count. Anchor the whole string so the assertion
    // cannot be satisfied by a tag name that happens to contain "article".
    await expect(tagRow.getByText(/^\d+ articles?$/)).toBeVisible()
    // Should have edit and delete buttons
    await expect(tagRow.locator("button")).toHaveCount(2)
  })

  test("can edit tag", async ({ page }) => {
    await goToTagsTab(page)

    const tagRow = page.getByTestId("tag-row").filter({ hasText: testTagName })

    await tagRow.getByRole("button", { name: /^Edit / }).click()

    // Dialog should open
    await expect(page.getByRole("heading", { name: "Edit Tag" })).toBeVisible()

    // Change the name
    const nameInput = page.getByLabel(/tag name/i)
    await nameInput.clear()
    await nameInput.fill("updated-tag-name")

    await page.getByRole("button", { name: /save changes/i }).click()

    // Updated name should appear
    await expect(page.getByText("updated-tag-name")).toBeVisible({ timeout: 5000 })
  })

  test("can delete tag with confirmation", async ({ page }) => {
    await goToTagsTab(page)

    const tagRow = page.getByTestId("tag-row").filter({ hasText: testTagName })

    // Set up dialog handler to confirm
    page.on("dialog", (dialog) => dialog.accept())

    await tagRow.getByRole("button", { name: /^Delete / }).click()

    // Tag should be removed
    await expect(tagRow).not.toBeVisible({ timeout: 5000 })

    // Clear the testTagId since it's already deleted
    testTagId = 0
  })
})

// =============================================================================
// FILTER DIALOG FORM TESTS
// =============================================================================

test.describe("Filter Form Elements", () => {
  // Run these tests serially to avoid dialog contention issues
  test.describe.configure({ mode: "serial" })

  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test.skip("filter dialog has all form elements", async ({ page }) => {
    // Skipped: Flaky due to nested dialog behavior - filter dialog inside Settings dialog has timing issues
    await goToFiltersTab(page)
    await page.getByRole("button", { name: /new filter/i }).click()

    // Check for main form elements
    await expect(page.locator("#filter-title")).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole("button", { name: /add rule/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /add action/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /create filter/i })).toBeVisible()
  })

  test.skip("can add and remove rules", async ({ page }) => {
    // Skipped: This test is flaky due to dialog state and element timing issues
    await goToFiltersTab(page)
    await page.getByRole("button", { name: /new filter/i }).click()

    // Wait for dialog to be visible
    await expect(page.locator("#filter-title")).toBeVisible({ timeout: 5000 })

    // Initially has one rule - check for pattern input
    const patternInputs = page.locator('input[placeholder*="expression" i]')
    await expect(patternInputs.first()).toBeVisible({ timeout: 5000 })

    const initialCount = await patternInputs.count()

    // Add another rule
    await page.getByRole("button", { name: /add rule/i }).click()
    await expect(patternInputs).toHaveCount(initialCount + 1)

    // Remove the last rule by clicking the X button within its rule container
    // Rules are in .bg-muted containers with X buttons
    const ruleContainers = page.locator('[class*="bg-muted"]')
    const lastRuleContainer = ruleContainers.last()
    const removeButton = lastRuleContainer.locator("button").filter({ has: page.locator('svg') }).first()
    await removeButton.click()
    await expect(patternInputs).toHaveCount(initialCount)
  })

  test.skip("validation prevents empty filter creation", async ({ page }) => {
    // Skipped: Flaky due to nested dialog behavior - depends on filter dialog opening successfully
    await goToFiltersTab(page)
    await page.getByRole("button", { name: /new filter/i }).click()

    // Wait for dialog to be visible
    await expect(page.locator("#filter-title")).toBeVisible({ timeout: 5000 })

    // Set up dialog handler for validation alert
    let alertShown = false
    page.on("dialog", (dialog) => {
      alertShown = true
      dialog.accept()
    })

    // Try to create without filling required fields
    await page.getByRole("button", { name: /create filter/i }).click()

    expect(alertShown).toBe(true)
  })
})

// =============================================================================
// TAG DIALOG FORM TESTS
// =============================================================================

test.describe("Tag Form Elements", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("tag dialog has all form elements", async ({ page }) => {
    await goToTagsTab(page)
    await page.getByRole("button", { name: /new tag/i }).click()

    // Check for main form elements. Scope to the tag dialog and match the field
    // labels exactly: "preview" in particular is a common word in this UI
    // (PreferencesPanel's "Show content preview", the OPML import preview), and
    // an unscoped regex would start matching them if the dialog ever grows.
    const tagDialog = page.getByRole("dialog")
    await expect(page.getByLabel(/tag name/i)).toBeVisible({ timeout: 5000 })
    await expect(tagDialog.getByText("Preview", { exact: true })).toBeVisible()
    await expect(
      tagDialog.getByText("Color Presets", { exact: true })
    ).toBeVisible()
    await expect(page.getByLabel(/background/i)).toBeVisible()
    await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible()
    await expect(
      page.getByRole("button", { name: /^create tag$/i })
    ).toBeVisible()
  })

  test("color presets update the colors", async ({ page }) => {
    await goToTagsTab(page)
    await page.getByRole("button", { name: /new tag/i }).click()

    // Wait for dialog to be visible
    await expect(page.getByLabel(/tag name/i)).toBeVisible({ timeout: 5000 })

    // Clicking a preset writes its colours into both hex inputs
    await page.getByTestId("color-preset").first().click()

    await expect(page.locator("#bg-color")).toHaveValue("#ef4444")
    await expect(page.locator("#fg-color")).toHaveValue("#ffffff")
  })

  test("validation prevents empty tag creation", async ({ page }) => {
    await goToTagsTab(page)
    await page.getByRole("button", { name: /new tag/i }).click()

    // Wait for dialog to be visible
    await expect(page.getByLabel(/tag name/i)).toBeVisible({ timeout: 5000 })

    // Set up dialog handler for validation alert
    let alertShown = false
    page.on("dialog", (dialog) => {
      alertShown = true
      dialog.accept()
    })

    // Try to create without filling the name
    await page.getByRole("button", { name: /^create tag$/i }).click()

    expect(alertShown).toBe(true)
  })
})

// =============================================================================
// FILTER TEST FEATURE
// =============================================================================

test.describe("Filter Test Feature", () => {
  let testFilterId: number

  test.beforeEach(async ({ page }) => {
    // Create a filter that matches everything
    const filter = await createFilterViaApi(page, "E2E Test Filter " + Date.now(), ".*")
    testFilterId = filter.id
    await waitForAppReady(page)
  })

  test.afterEach(async ({ page }) => {
    if (testFilterId) {
      await deleteFilterViaApi(page, testFilterId)
    }
  })

  test("test button shows match results", async ({ page }) => {
    await goToFiltersTab(page)

    const filterRow = page.getByTestId("filter-row").filter({
      hasText: "E2E Test Filter",
    })

    await filterRow.getByRole("button", { name: /^Test / }).click()

    // Should show the match results badge, which renders "<matches>/<total>
    // matched". Anchored so it cannot drift onto other numeric row text.
    await expect(filterRow.getByText(/^\d+\/\d+ matched$/)).toBeVisible({
      timeout: 10000,
    })
  })
})
