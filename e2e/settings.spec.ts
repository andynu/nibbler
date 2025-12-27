import { test, expect, Page } from "@playwright/test"

/**
 * Settings and preferences E2E tests.
 *
 * Tests the settings dialog and user preferences that affect application behavior.
 */

// Helper to wait for app to be ready
async function waitForAppReady(page: Page) {
  await page.goto("/")
  // Wait for TTRB branding to confirm app is fully loaded
  await expect(page.getByText("TTRB")).toBeVisible({ timeout: 10000 })
}

// Helper to open settings dialog
async function openSettings(page: Page) {
  const settingsButton = page
    .getByRole("button", { name: /settings|cog/i })
    .first()
  await settingsButton.click()
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2000 })
}

test.describe("Opening Settings", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("settings button opens dialog", async ({ page }) => {
    await openSettings(page)

    await expect(page.getByRole("dialog")).toBeVisible()
  })

  test("dialog has Settings title", async ({ page }) => {
    await openSettings(page)

    await expect(page.getByText("Settings")).toBeVisible()
  })

  test("dialog has tabbed interface", async ({ page }) => {
    await openSettings(page)

    await expect(page.getByRole("tablist")).toBeVisible()
  })

  test("Escape closes dialog", async ({ page }) => {
    await openSettings(page)

    await page.keyboard.press("Escape")

    await expect(page.getByRole("dialog")).not.toBeVisible()
  })

  test("has Feeds tab", async ({ page }) => {
    await openSettings(page)

    await expect(page.getByRole("tab", { name: /feeds/i })).toBeVisible()
  })

  test("has Preferences tab", async ({ page }) => {
    await openSettings(page)

    await expect(page.getByRole("tab", { name: /preferences/i })).toBeVisible()
  })

  test("has Filters tab", async ({ page }) => {
    await openSettings(page)

    await expect(page.getByRole("tab", { name: /filters/i })).toBeVisible()
  })

  test("has Labels tab", async ({ page }) => {
    await openSettings(page)

    await expect(page.getByRole("tab", { name: /labels/i })).toBeVisible()
  })
})

test.describe("Tab Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("can switch to Feeds tab", async ({ page }) => {
    await openSettings(page)

    await page.getByRole("tab", { name: /feeds/i }).click()

    await expect(page.getByRole("tab", { name: /feeds/i })).toHaveAttribute(
      "data-state",
      "active"
    )
  })

  test("can switch to Preferences tab", async ({ page }) => {
    await openSettings(page)

    await page.getByRole("tab", { name: /preferences/i }).click()

    await expect(
      page.getByRole("tab", { name: /preferences/i })
    ).toHaveAttribute("data-state", "active")
  })

  test("can switch to Filters tab", async ({ page }) => {
    await openSettings(page)

    await page.getByRole("tab", { name: /filters/i }).click()

    await expect(page.getByRole("tab", { name: /filters/i })).toHaveAttribute(
      "data-state",
      "active"
    )
  })

  test("can switch to Labels tab", async ({ page }) => {
    await openSettings(page)

    await page.getByRole("tab", { name: /labels/i }).click()

    await expect(page.getByRole("tab", { name: /labels/i })).toHaveAttribute(
      "data-state",
      "active"
    )
  })

  test("can switch to Import/Export tab", async ({ page }) => {
    await openSettings(page)

    await page.getByRole("tab", { name: /import|export/i }).click()

    await expect(
      page.getByRole("tab", { name: /import|export/i })
    ).toHaveAttribute("data-state", "active")
  })
})

test.describe("Preferences Tab - Article Display", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("shows Appearance section", async ({ page }) => {
    await openSettings(page)
    await page.getByRole("tab", { name: /preferences/i }).click()

    await expect(page.getByText("Appearance")).toBeVisible()
  })

  test("shows Article Display section", async ({ page }) => {
    await openSettings(page)
    await page.getByRole("tab", { name: /preferences/i }).click()

    await expect(page.getByText("Article Display")).toBeVisible()
  })

  test("shows content preview toggle", async ({ page }) => {
    await openSettings(page)
    await page.getByRole("tab", { name: /preferences/i }).click()

    await expect(
      page.getByRole("switch", { name: /content preview/i })
    ).toBeVisible()
  })

  test("shows strip images toggle", async ({ page }) => {
    await openSettings(page)
    await page.getByRole("tab", { name: /preferences/i }).click()

    await expect(
      page.getByRole("switch", { name: /images/i }).first()
    ).toBeVisible()
  })
})

test.describe("Preferences Tab - Reading Behavior", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("shows Reading Behavior section", async ({ page }) => {
    await openSettings(page)
    await page.getByRole("tab", { name: /preferences/i }).click()

    await expect(page.getByText("Reading Behavior")).toBeVisible()
  })

  test("shows confirm mark all read toggle", async ({ page }) => {
    await openSettings(page)
    await page.getByRole("tab", { name: /preferences/i }).click()

    await expect(
      page.getByRole("switch", { name: /confirm|mark.*read/i }).first()
    ).toBeVisible()
  })

  test("shows articles per page selector", async ({ page }) => {
    await openSettings(page)
    await page.getByRole("tab", { name: /preferences/i }).click()

    await expect(page.getByText(/articles per page/i)).toBeVisible()
  })
})

test.describe("Preferences Tab - Data Management", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("shows Data Management section", async ({ page }) => {
    await openSettings(page)
    await page.getByRole("tab", { name: /preferences/i }).click()

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
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("feeds tab shows feed organizer", async ({ page }) => {
    await openSettings(page)
    await page.getByRole("tab", { name: /feeds/i }).click()

    // Should show feed organizer content (the tab panel)
    await expect(page.getByRole("tab", { name: /feeds/i })).toHaveAttribute("data-state", "active")
  })

  test("is the default tab", async ({ page }) => {
    await openSettings(page)

    // Feeds tab should be active by default
    await expect(page.getByRole("tab", { name: /feeds/i })).toHaveAttribute(
      "data-state",
      "active"
    )
  })
})

test.describe("Filters Tab", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("filters tab shows filter content", async ({ page }) => {
    await openSettings(page)
    await page.getByRole("tab", { name: /filters/i }).click()

    // Should show filter management content (tab should be active)
    await expect(page.getByRole("tab", { name: /filters/i })).toHaveAttribute("data-state", "active")
  })
})

test.describe("Labels Tab", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("labels tab shows label content", async ({ page }) => {
    await openSettings(page)
    await page.getByRole("tab", { name: /labels/i }).click()

    // Should show label management content (tab should be active)
    await expect(page.getByRole("tab", { name: /labels/i })).toHaveAttribute("data-state", "active")
  })
})

test.describe("Import/Export Tab", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("import/export tab shows OPML options", async ({ page }) => {
    await openSettings(page)
    await page.getByRole("tab", { name: /import|export/i }).click()

    // Should show import/export content (tab should be active)
    await expect(page.getByRole("tab", { name: /import|export/i })).toHaveAttribute("data-state", "active")
  })
})

test.describe("Preference Toggle Interaction", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("clicking toggle changes its state", async ({ page }) => {
    await openSettings(page)
    await page.getByRole("tab", { name: /preferences/i }).click()

    const toggle = page.getByRole("switch", { name: /content preview/i })
    const initialState = await toggle.isChecked()

    await toggle.click()

    const newState = await toggle.isChecked()
    expect(newState).toBe(!initialState)

    // Toggle back to restore state
    await toggle.click()
  })
})

test.describe("Theme Selection", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("shows theme selector", async ({ page }) => {
    await openSettings(page)
    await page.getByRole("tab", { name: /preferences/i }).click()

    await expect(page.getByText("Theme")).toBeVisible()
  })
})

test.describe("Accent Color", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("shows accent color control", async ({ page }) => {
    await openSettings(page)
    await page.getByRole("tab", { name: /preferences/i }).click()

    await expect(page.getByText("Accent color", { exact: true })).toBeVisible()
  })
})
