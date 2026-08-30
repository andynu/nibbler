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

// The filter editor is a second dialog rendered from inside the Settings
// dialog, so two elements carry role=dialog while it is open. Scope every
// locator to this one by the accessible name Radix wires up from its
// DialogTitle; a bare page.getByRole("dialog") is ambiguous here, which is what
// the original "nested dialog" skip comments were reaching for.
function newFilterDialog(page: Page) {
  return page.getByRole("dialog", { name: "Create Filter" })
}

// Shape of GET/POST /api/v1/filters (Api::V1::FiltersController#filter_json).
interface ApiFilter {
  id: number
  title: string
  rules: Array<{ filter_type: string; reg_exp: string; inverse: boolean }>
  actions: Array<{ action_type: string; action_param: string | null }>
}

async function listFiltersViaApi(page: Page): Promise<ApiFilter[]> {
  const response = await page.request.get("/api/v1/filters")
  expect(response.ok()).toBe(true)
  return response.json()
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

  test("can open and close filter creation dialog", async ({ page }) => {
    await goToFiltersTab(page)

    await page.getByRole("button", { name: /new filter/i }).click()

    const dialog = newFilterDialog(page)
    await expect(dialog.getByLabel("Filter Name")).toHaveValue("")

    await dialog.getByRole("button", { name: /^cancel$/i }).click()
    await expect(dialog).toBeHidden()

    // Cancelling the inner dialog has to leave the outer one open on the same
    // tab. Radix dismisses the topmost layer only, but the two dialogs share
    // nothing that enforces it, and a close handler wired to the wrong
    // onOpenChange would tear down Settings as well - which a "the filter
    // dialog went away" assertion on its own would happily accept.
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible()
    await expect(page.getByRole("tab", { name: /filters/i })).toHaveAttribute(
      "data-state",
      "active"
    )
    await expect(
      page.getByRole("button", { name: /new filter/i })
    ).toBeVisible()
  })

  test("can create a filter through UI", async ({ page }) => {
    const filterTitle = "E2E UI Created " + Date.now()

    await goToFiltersTab(page)
    const before = await listFiltersViaApi(page)

    await page.getByRole("button", { name: /new filter/i }).click()

    const dialog = newFilterDialog(page)
    await dialog.getByLabel("Filter Name").fill(filterTitle)
    await dialog
      .getByPlaceholder("Regular expression pattern")
      .fill("sponsored")

    await dialog.getByRole("button", { name: /^create filter$/i }).click()
    await expect(dialog).toBeHidden()

    // The new row has to describe the rule that was typed, not just carry the
    // title: FilterManager renders this summary from the created filter's
    // rules, so a create path that dropped filter_rules_attributes would show
    // a bare row here.
    const filterRow = page
      .getByTestId("filter-row")
      .filter({ hasText: filterTitle })
    await expect(filterRow).toContainText('Match all: Title ~ "sponsored"')
    await expect(
      filterRow.getByText("Mark as read", { exact: true })
    ).toBeVisible()

    // And the server has to have stored it. Everything above this point reads
    // React state; without a round trip the test would still pass against a
    // create that rendered optimistically and never reached the API.
    const after = await listFiltersViaApi(page)
    expect(after).toHaveLength(before.length + 1)

    const created = after.find((f) => f.title === filterTitle)
    expect(
      created,
      `POST /api/v1/filters did not persist a filter titled ${filterTitle}`
    ).toBeDefined()
    expect(created!.rules).toHaveLength(1)
    expect(created!.rules[0]).toMatchObject({
      filter_type: "title",
      reg_exp: "sponsored",
      inverse: false,
    })
    expect(created!.actions).toHaveLength(1)
    expect(created!.actions[0].action_type).toBe("mark_read")

    await deleteFilterViaApi(page, created!.id)
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

  test("filter dialog has all form elements", async ({ page }) => {
    await goToFiltersTab(page)
    await page.getByRole("button", { name: /new filter/i }).click()

    const dialog = newFilterDialog(page)
    await expect(dialog.getByRole("button", { name: /add rule/i })).toBeVisible()
    await expect(
      dialog.getByRole("button", { name: /add action/i })
    ).toBeVisible()
    await expect(dialog.getByRole("button", { name: /^cancel$/i })).toBeVisible()
    await expect(
      dialog.getByRole("button", { name: /^create filter$/i })
    ).toBeVisible()

    // Presence on its own is a weak claim, so assert the state a new filter
    // opens in: an empty name, enabled, and exactly one rule and one action
    // already scaffolded. If the form reset dropped either, the dialog would
    // still have "all form elements" while being unsaveable - handleSubmit
    // rejects a filter with no rules or no actions.
    await expect(dialog.getByLabel("Filter Name")).toHaveValue("")
    await expect(dialog.getByRole("switch", { name: "Enabled" })).toBeChecked()
    await expect(
      dialog.getByPlaceholder("Regular expression pattern")
    ).toHaveCount(1)
    await expect(dialog.getByRole("combobox")).toHaveText([
      "Match ALL",
      "Title",
      "All feeds",
      "Mark as read",
    ])
  })

  test("can add and remove rules", async ({ page }) => {
    await goToFiltersTab(page)
    await page.getByRole("button", { name: /new filter/i }).click()

    const dialog = newFilterDialog(page)
    const patterns = dialog.getByPlaceholder("Regular expression pattern")
    await expect(patterns).toHaveCount(1)

    await patterns.first().fill("first-rule")
    await dialog.getByRole("button", { name: /add rule/i }).click()
    await expect(patterns).toHaveCount(2)
    await patterns.nth(1).fill("second-rule")

    // Remove the first rule, not the last, and assert on which one survived.
    // handleRemoveRule filters by index, and a count-only assertion after
    // removing the last row passes just as well when the wrong row goes. The
    // version of this test that shipped skipped never reached a remove button
    // at all: it looked for [class*="bg-muted"], which matches the action rows
    // and the filter list behind the dialog as well as the rule rows, took the
    // last of those and clicked the first icon button in it - a Select trigger.
    // The rule count then stayed at 2 and the test failed.
    await dialog.getByRole("button", { name: "Remove rule 1" }).click()
    await expect(patterns).toHaveCount(1)
    await expect(patterns.first()).toHaveValue("second-rule")

    // Removing back down to one rule takes the remove buttons away with it:
    // the last rule must not be removable, or the form becomes unsaveable.
    await expect(
      dialog.getByRole("button", { name: /^remove rule/i })
    ).toHaveCount(0)
  })

  test("can add and remove actions", async ({ page }) => {
    await goToFiltersTab(page)
    await page.getByRole("button", { name: /new filter/i }).click()

    const dialog = newFilterDialog(page)
    // The action selects are the trailing comboboxes in the dialog, so the
    // last one is always the last action row.
    const lastActionSelect = dialog.getByRole("combobox").last()
    const removeButtons = dialog.getByRole("button", { name: /^remove action/i })

    // A new filter starts with one action, so no remove button is offered.
    await expect(removeButtons).toHaveCount(0)

    await dialog.getByRole("button", { name: /add action/i }).click()
    await expect(removeButtons).toHaveCount(2)

    // Both rows default to "Mark as read", so switch the new one to Star to
    // tell them apart, then drop the first and check the starred row is what
    // survived rather than just counting rows.
    await lastActionSelect.click()
    await page.getByRole("option", { name: "Star article" }).click()
    await expect(lastActionSelect).toHaveText("Star article")

    await dialog.getByRole("button", { name: "Remove action 1" }).click()
    await expect(removeButtons).toHaveCount(0)
    await expect(lastActionSelect).toHaveText("Star article")
  })

  test("validation prevents empty filter creation", async ({ page }) => {
    await goToFiltersTab(page)
    const before = await listFiltersViaApi(page)

    await page.getByRole("button", { name: /new filter/i }).click()
    const dialog = newFilterDialog(page)
    await expect(dialog.getByLabel("Filter Name")).toHaveValue("")

    // Collect the alert text rather than a boolean. "an alert appeared" is also
    // satisfied by handleSubmit's "Failed to save filter", which would mean the
    // request went out and failed - the opposite of what this test claims.
    const alerts: string[] = []
    page.on("dialog", async (browserDialog) => {
      alerts.push(browserDialog.message())
      await browserDialog.accept()
    })

    await dialog.getByRole("button", { name: /^create filter$/i }).click()
    await expect.poll(() => alerts).toEqual(["Filter name is required"])
    await expect(dialog).toBeVisible()

    // Naming it is not enough: the scaffolded rule still has no pattern. Losing
    // this gate would not silently create a bad filter - FilterRule validates
    // reg_exp presence, so the POST comes back 422 - but the user would get
    // handleSubmit's generic "Failed to save filter" instead of being told
    // which field is empty, so the message is the behaviour worth pinning.
    await dialog.getByLabel("Filter Name").fill("E2E rejected " + Date.now())
    await dialog.getByRole("button", { name: /^create filter$/i }).click()
    await expect
      .poll(() => alerts)
      .toEqual(["Filter name is required", "All rules must have a pattern"])
    await expect(dialog).toBeVisible()

    // Nothing reached the server on either attempt.
    expect(await listFiltersViaApi(page)).toHaveLength(before.length)
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
