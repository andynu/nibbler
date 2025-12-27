import { type Page, type Locator, expect } from "@playwright/test"

/**
 * Page object for the Command Palette (Cmd+K dialog).
 */
export class CommandPalettePage {
  readonly page: Page
  readonly dialog: Locator
  readonly input: Locator
  readonly results: Locator

  constructor(page: Page) {
    this.page = page
    this.dialog = page.getByRole("dialog")
    this.input = page.getByRole("combobox")
    this.results = page.locator("[cmdk-list]")
  }

  async open(): Promise<void> {
    await this.page.keyboard.press("Control+k")
    await expect(this.dialog).toBeVisible({ timeout: 2000 })
  }

  async close(): Promise<void> {
    await this.page.keyboard.press("Escape")
    await expect(this.dialog).not.toBeVisible()
  }

  async isVisible(): Promise<boolean> {
    return this.dialog.isVisible()
  }

  async search(query: string): Promise<void> {
    await this.input.fill(query)
  }

  async selectFirstResult(): Promise<void> {
    await this.page.keyboard.press("Enter")
  }

  async selectResultByText(text: string): Promise<void> {
    await this.page.getByText(text).click()
  }

  async navigateDown(): Promise<void> {
    await this.page.keyboard.press("ArrowDown")
  }

  async navigateUp(): Promise<void> {
    await this.page.keyboard.press("ArrowUp")
  }

  async getResultCount(): Promise<number> {
    const items = this.results.locator("[cmdk-item]")
    return items.count()
  }
}
