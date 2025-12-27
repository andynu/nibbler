import { test as base, expect, type Page } from "@playwright/test"
import { FeedsPage } from "../pages/feeds.page"
import { SettingsPage } from "../pages/settings.page"
import { CommandPalettePage } from "../pages/command-palette.page"

/**
 * Custom test fixtures for E2E tests.
 *
 * Fixtures provide pre-configured page objects that are automatically
 * set up and torn down for each test.
 */

type Fixtures = {
  /**
   * FeedsPage fixture - navigates to the app and waits for it to load.
   */
  feedsPage: FeedsPage

  /**
   * SettingsPage fixture - provides access to settings dialog interactions.
   * Note: Dialog must be opened manually using feedsPage.openSettings().
   */
  settingsPage: SettingsPage

  /**
   * CommandPalettePage fixture - provides command palette interactions.
   * Note: Palette must be opened manually using commandPalette.open().
   */
  commandPalette: CommandPalettePage

  /**
   * Authenticated page fixture - navigates to app and ensures it's ready.
   * In dev/test mode, the app auto-authenticates to the first user.
   */
  authenticatedPage: Page
}

export const test = base.extend<Fixtures>({
  feedsPage: async ({ page }, use) => {
    const feedsPage = new FeedsPage(page)
    await feedsPage.goto()
    await use(feedsPage)
  },

  settingsPage: async ({ page }, use) => {
    const settingsPage = new SettingsPage(page)
    await use(settingsPage)
  },

  commandPalette: async ({ page }, use) => {
    const commandPalette = new CommandPalettePage(page)
    await use(commandPalette)
  },

  authenticatedPage: async ({ page }, use) => {
    await page.goto("/")
    // Wait for app to be ready
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
    await use(page)
  },
})

export { expect } from "@playwright/test"
