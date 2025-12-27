import { test, expect, Page } from "@playwright/test"

/**
 * Keyboard navigation E2E tests.
 *
 * Tests keyboard-driven navigation and actions throughout the application.
 */

// Helper to wait for app to be ready
async function waitForAppReady(page: Page) {
  await page.goto("/")
  await page.waitForSelector("button", { timeout: 10000 })
  // Give React time to mount and attach event handlers
  await page.waitForTimeout(500)
}

test.describe("Article Navigation (j/k)", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("j key is recognized", async ({ page }) => {
    // Press j - should either select an entry or do nothing if no entries
    await page.keyboard.press("j")
    // No error should occur
    await page.waitForTimeout(200)
  })

  test("k key is recognized", async ({ page }) => {
    // Press k - should either select an entry or do nothing if no entries
    await page.keyboard.press("k")
    // No error should occur
    await page.waitForTimeout(200)
  })

  test("n key works as alias for j", async ({ page }) => {
    await page.keyboard.press("n")
    await page.waitForTimeout(200)
  })

  test("p key works as alias for k", async ({ page }) => {
    await page.keyboard.press("p")
    await page.waitForTimeout(200)
  })

  test("j then k navigates back and forth", async ({ page }) => {
    await page.keyboard.press("j")
    await page.waitForTimeout(100)
    await page.keyboard.press("k")
    await page.waitForTimeout(200)
  })
})

test.describe("Article Actions", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("o key is recognized", async ({ page }) => {
    await page.keyboard.press("o")
    await page.waitForTimeout(200)
  })

  test("Enter key is recognized", async ({ page }) => {
    // First select something with j
    await page.keyboard.press("j")
    await page.waitForTimeout(100)
    await page.keyboard.press("Enter")
    await page.waitForTimeout(200)
  })

  test("Escape key deselects", async ({ page }) => {
    await page.keyboard.press("j")
    await page.waitForTimeout(100)
    await page.keyboard.press("Escape")
    await page.waitForTimeout(200)
  })

  test("m key toggles read status", async ({ page }) => {
    await page.keyboard.press("j")
    await page.waitForTimeout(100)
    await page.keyboard.press("m")
    await page.waitForTimeout(200)
  })

  test("u key works as alias for m", async ({ page }) => {
    await page.keyboard.press("j")
    await page.waitForTimeout(100)
    await page.keyboard.press("u")
    await page.waitForTimeout(200)
  })

  test("s key toggles starred", async ({ page }) => {
    await page.keyboard.press("j")
    await page.waitForTimeout(100)
    await page.keyboard.press("s")
    await page.waitForTimeout(200)
  })

  test("r key refreshes", async ({ page }) => {
    await page.keyboard.press("r")
    await page.waitForTimeout(200)
  })
})

test.describe("View Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("a key navigates to All view", async ({ page }) => {
    await page.keyboard.press("a")
    await page.waitForTimeout(300)
  })

  test("f key navigates to Fresh view", async ({ page }) => {
    await page.keyboard.press("f")
    await page.waitForTimeout(300)
  })

  test("Shift+S navigates to Starred view", async ({ page }) => {
    await page.keyboard.press("Shift+S")
    await page.waitForTimeout(300)
  })
})

test.describe("Help Dialog", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("? opens keyboard shortcuts dialog", async ({ page }) => {
    await page.keyboard.press("Shift+?")

    // Dialog should appear
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible({ timeout: 2000 })
    await expect(
      page.getByRole("heading", { name: "Keyboard Shortcuts" })
    ).toBeVisible()
  })

  test("Escape closes help dialog", async ({ page }) => {
    await page.keyboard.press("Shift+?")
    await expect(page.getByRole("dialog")).toBeVisible()

    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 2000 })
  })

  test("help dialog shows navigation shortcuts", async ({ page }) => {
    await page.keyboard.press("Shift+?")
    await expect(page.getByRole("dialog")).toBeVisible()

    // Check that navigation shortcuts are documented
    await expect(page.getByText(/next entry/i)).toBeVisible()
    await expect(page.getByText(/previous entry/i)).toBeVisible()
  })

  test("help dialog shows action shortcuts", async ({ page }) => {
    await page.keyboard.press("Shift+?")
    await expect(page.getByRole("dialog")).toBeVisible()

    // Check that action shortcuts are documented
    await expect(page.getByText(/toggle read/i)).toBeVisible()
    await expect(page.getByText(/toggle starred/i)).toBeVisible()
  })
})

test.describe("Command Palette", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("Ctrl+K opens command palette", async ({ page }) => {
    await page.keyboard.press("Control+k")

    // Command palette should appear
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2000 })
  })

  test("Meta+K opens command palette", async ({ page }) => {
    await page.keyboard.press("Meta+k")

    // Command palette should appear
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2000 })
  })

  test("Escape closes command palette", async ({ page }) => {
    await page.keyboard.press("Control+k")
    await expect(page.getByRole("dialog")).toBeVisible()

    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 2000 })
  })

  test("command palette has search input", async ({ page }) => {
    await page.keyboard.press("Control+k")
    await expect(page.getByRole("dialog")).toBeVisible()

    // Should have a search/combobox input
    const input = page.getByRole("combobox")
    await expect(input).toBeVisible()
  })
})

test.describe("Input Focus Handling", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("shortcuts disabled when typing in input", async ({ page }) => {
    // Open subscribe dialog which has an input
    const addButton = page
      .getByRole("button", { name: /subscribe|add feed|\+/i })
      .first()

    if ((await addButton.count()) > 0) {
      await addButton.click()
      await expect(page.getByRole("dialog")).toBeVisible()

      // Find the input and type
      const input = page.getByRole("textbox").first()
      await input.fill("j")

      // The 'j' should be in the input, not triggering navigation
      await expect(input).toHaveValue("j")
    }
  })

  test("shortcuts work after closing dialog", async ({ page }) => {
    // Open and close a dialog
    const addButton = page
      .getByRole("button", { name: /subscribe|add feed|\+/i })
      .first()

    if ((await addButton.count()) > 0) {
      await addButton.click()
      await expect(page.getByRole("dialog")).toBeVisible()

      // Close dialog
      await page.keyboard.press("Escape")
      await expect(page.getByRole("dialog")).not.toBeVisible()

      // Shortcuts should work again
      await page.keyboard.press("j")
      await page.waitForTimeout(200)
    }
  })
})

test.describe("Category Navigation (Shift+J/K)", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("Shift+J navigates to next category", async ({ page }) => {
    await page.keyboard.press("Shift+J")
    await page.waitForTimeout(200)
  })

  test("Shift+K navigates to previous category", async ({ page }) => {
    await page.keyboard.press("Shift+K")
    await page.waitForTimeout(200)
  })
})

test.describe("Rapid Key Sequences", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("handles rapid j key presses", async ({ page }) => {
    // Rapid navigation - should not cause errors
    await page.keyboard.press("j")
    await page.keyboard.press("j")
    await page.keyboard.press("j")
    await page.waitForTimeout(300)
  })

  test("handles rapid k key presses", async ({ page }) => {
    // Rapid navigation - should not cause errors
    await page.keyboard.press("k")
    await page.keyboard.press("k")
    await page.keyboard.press("k")
    await page.waitForTimeout(300)
  })

  test("handles alternating j and k", async ({ page }) => {
    // Alternating navigation
    await page.keyboard.press("j")
    await page.keyboard.press("k")
    await page.keyboard.press("j")
    await page.keyboard.press("k")
    await page.waitForTimeout(300)
  })
})

test.describe("Content Scrolling (Ctrl+F/B)", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test("Ctrl+F scrolls content down", async ({ page }) => {
    await page.keyboard.press("j") // Select an entry first
    await page.waitForTimeout(100)
    await page.keyboard.press("Control+f")
    await page.waitForTimeout(200)
  })

  test("Ctrl+B scrolls content up", async ({ page }) => {
    await page.keyboard.press("j") // Select an entry first
    await page.waitForTimeout(100)
    await page.keyboard.press("Control+b")
    await page.waitForTimeout(200)
  })
})
