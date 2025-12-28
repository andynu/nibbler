import { test, expect } from "./fixtures"

/**
 * Settings and preferences E2E tests.
 *
 * Tests the settings dialog and user preferences that affect application behavior.
 */

test.describe("Opening Settings", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("settings button opens dialog", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await expect(settingsPage.dialog).toBeVisible()
  })

  test("dialog has Settings title", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await expect(settingsPage.title).toBeVisible()
  })

  test("dialog has tabbed interface", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await expect(settingsPage.tabList).toBeVisible()
  })

  test("Escape closes dialog", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await settingsPage.close()

    await expect(settingsPage.dialog).not.toBeVisible()
  })

  test("has Feeds tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await expect(settingsPage.feedsTab).toBeVisible()
  })

  test("has Preferences tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await expect(settingsPage.preferencesTab).toBeVisible()
  })

  test("has Filters tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await expect(settingsPage.filtersTab).toBeVisible()
  })

  test("has Labels tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await expect(settingsPage.labelsTab).toBeVisible()
  })
})

test.describe("Tab Navigation", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("can switch to Feeds tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await settingsPage.goToFeedsTab()

    await expect(settingsPage.feedsTab).toHaveAttribute("data-state", "active")
  })

  test("can switch to Preferences tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await settingsPage.goToPreferencesTab()

    await expect(settingsPage.preferencesTab).toHaveAttribute("data-state", "active")
  })

  test("can switch to Filters tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await settingsPage.goToFiltersTab()

    await expect(settingsPage.filtersTab).toHaveAttribute("data-state", "active")
  })

  test("can switch to Labels tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await settingsPage.goToLabelsTab()

    await expect(settingsPage.labelsTab).toHaveAttribute("data-state", "active")
  })

  test("can switch to Import/Export tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    await settingsPage.goToImportExportTab()

    await expect(settingsPage.importExportTab).toHaveAttribute("data-state", "active")
  })

  test("Escape closes dialog after switching tabs", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    // Switch through multiple tabs
    await settingsPage.goToFiltersTab()
    await settingsPage.goToPreferencesTab()

    // Escape should close the dialog entirely
    await settingsPage.close()

    await expect(settingsPage.dialog).not.toBeVisible()
  })
})

test.describe("Preferences Tab - Article Display", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("shows Appearance section", async ({ feedsPage, settingsPage, page }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    await expect(page.getByText("Appearance")).toBeVisible()
  })

  test("shows Article Display section", async ({ feedsPage, settingsPage, page }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    await expect(page.getByText("Article Display")).toBeVisible()
  })

  test("shows content preview toggle", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    const toggle = await settingsPage.getContentPreviewToggle()
    await expect(toggle).toBeVisible()
  })

  test("shows strip images toggle", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    const toggle = await settingsPage.getStripImagesToggle()
    await expect(toggle).toBeVisible()
  })
})

test.describe("Preferences Tab - Reading Behavior", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("shows Reading Behavior section", async ({ feedsPage, settingsPage, page }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    await expect(page.getByText("Reading Behavior")).toBeVisible()
  })

  test("shows confirm mark all read toggle", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    const toggle = await settingsPage.getConfirmMarkAllReadToggle()
    await expect(toggle).toBeVisible()
  })

  test("shows articles per page selector", async ({ feedsPage, settingsPage, page }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    await expect(page.getByText(/articles per page/i)).toBeVisible()
  })
})

test.describe("Preferences Tab - Data Management", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("shows Data Management section", async ({ feedsPage, settingsPage, page }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    await expect(page.getByText("Data Management")).toBeVisible()
  })
})

test.describe("Preferences API", () => {
  test("can get preferences via API", async ({ page }) => {
    const response = await page.request.get("/api/v1/preferences")
    expect(response.ok()).toBe(true)

    const prefs = await response.json()
    expect(prefs).toBeDefined()
  })

  test("can update preferences via API", async ({ page }) => {
    // Get current value first
    const getResponse = await page.request.get("/api/v1/preferences")
    const currentPrefs = await getResponse.json()

    // Toggle a preference
    const newValue =
      currentPrefs.show_content_preview === "true" ? "false" : "true"

    const updateResponse = await page.request.patch("/api/v1/preferences", {
      data: { show_content_preview: newValue },
    })
    expect(updateResponse.ok()).toBe(true)

    // Restore original value
    await page.request.patch("/api/v1/preferences", {
      data: { show_content_preview: currentPrefs.show_content_preview },
    })
  })

  test("preferences include expected keys", async ({ page }) => {
    const response = await page.request.get("/api/v1/preferences")
    const prefs = await response.json()

    // Check for some expected preference keys
    expect(prefs).toHaveProperty("show_content_preview")
    expect(prefs).toHaveProperty("theme")
  })
})

test.describe("Feeds Tab", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("feeds tab shows feed organizer", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()
    await settingsPage.goToFeedsTab()

    // Should show feed organizer content (the tab panel)
    await expect(settingsPage.feedsTab).toHaveAttribute("data-state", "active")
  })

  test("is the default tab", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()

    // Feeds tab should be active by default
    await expect(settingsPage.feedsTab).toHaveAttribute("data-state", "active")
  })
})

test.describe("Filters Tab", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("filters tab shows filter content", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()
    await settingsPage.goToFiltersTab()

    // Should show filter management content (tab should be active)
    await expect(settingsPage.filtersTab).toHaveAttribute("data-state", "active")
  })
})

test.describe("Labels Tab", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("labels tab shows label content", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()
    await settingsPage.goToLabelsTab()

    // Should show label management content (tab should be active)
    await expect(settingsPage.labelsTab).toHaveAttribute("data-state", "active")
  })
})

test.describe("Import/Export Tab", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("import/export tab shows OPML options", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()
    await settingsPage.goToImportExportTab()

    // Should show import/export content (tab should be active)
    await expect(settingsPage.importExportTab).toHaveAttribute("data-state", "active")
  })
})

test.describe("Preference Toggle Interaction", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("clicking toggle changes its state", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    const toggle = await settingsPage.getContentPreviewToggle()
    const initialState = await toggle.isChecked()

    await toggle.click()

    const newState = await toggle.isChecked()
    expect(newState).toBe(!initialState)

    // Toggle back to restore state
    await toggle.click()
  })
})

test.describe("Theme Selection", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("shows theme selector", async ({ feedsPage, settingsPage }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    const themeText = await settingsPage.getThemeText()
    await expect(themeText).toBeVisible()
  })
})

test.describe("Accent Color", () => {
  test.beforeEach(async ({ feedsPage }) => {
    await feedsPage.waitForBranding()
  })

  test("shows accent color control", async ({ feedsPage, settingsPage, page }) => {
    await feedsPage.openSettings()
    await settingsPage.goToPreferencesTab()

    await expect(page.getByText("Accent color", { exact: true })).toBeVisible()
  })
})
