import { type Page, type Locator, expect } from "@playwright/test"

/**
 * Base page class providing common functionality for all page objects.
 */
export abstract class BasePage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /**
   * Navigate to the page URL. Must be implemented by subclasses.
   */
  abstract goto(): Promise<void>

  /**
   * Wait for the page to be fully loaded and interactive.
   */
  async waitForReady(): Promise<void> {
    await expect(this.page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
    await expect(this.page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
  }
}
