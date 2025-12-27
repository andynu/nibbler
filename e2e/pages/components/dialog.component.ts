import { type Page, type Locator, expect } from "@playwright/test"

/**
 * Base component for dialog interactions.
 */
export class DialogComponent {
  readonly page: Page
  readonly dialog: Locator

  constructor(page: Page) {
    this.page = page
    this.dialog = page.getByRole("dialog")
  }

  async isVisible(): Promise<boolean> {
    return this.dialog.isVisible()
  }

  async waitForVisible(): Promise<void> {
    await expect(this.dialog).toBeVisible({ timeout: 2000 })
  }

  async waitForHidden(): Promise<void> {
    await expect(this.dialog).not.toBeVisible({ timeout: 2000 })
  }

  async closeViaEscape(): Promise<void> {
    await this.page.keyboard.press("Escape")
    await this.waitForHidden()
  }

  async closeViaButton(): Promise<void> {
    const closeButton = this.dialog.getByRole("button", { name: /close|cancel/i })
    await closeButton.click()
    await this.waitForHidden()
  }

  async getTitle(): Promise<string | null> {
    const title = this.dialog.locator("h2, [role='heading']").first()
    return title.textContent()
  }
}
