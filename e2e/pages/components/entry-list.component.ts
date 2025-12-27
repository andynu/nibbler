import { type Page, type Locator, expect } from "@playwright/test"

/**
 * Component for the entry list interactions.
 */
export class EntryListComponent {
  readonly page: Page
  readonly container: Locator
  readonly entries: Locator
  readonly markAllReadButton: Locator
  readonly title: Locator

  constructor(page: Page) {
    this.page = page
    this.container = page.getByTestId("entry-list")
    this.entries = this.container.locator("[data-entry-id]")
    this.markAllReadButton = page.getByRole("button", { name: /mark.*read/i })
    this.title = this.container.locator("h2, [data-list-title]").first()
  }

  async getEntryCount(): Promise<number> {
    return this.entries.count()
  }

  async selectEntryByIndex(index: number): Promise<void> {
    await this.entries.nth(index).click()
  }

  async selectEntryByTitle(title: string): Promise<void> {
    await this.container.getByText(title).click()
  }

  async getSelectedEntry(): Promise<Locator | null> {
    const selected = this.entries.filter({ has: this.page.locator("[data-selected='true']") })
    const count = await selected.count()
    return count > 0 ? selected.first() : null
  }

  async markAllAsRead(): Promise<void> {
    await this.markAllReadButton.click()
  }

  async getListTitle(): Promise<string | null> {
    return this.title.textContent()
  }

  async isLoading(): Promise<boolean> {
    const loading = this.container.locator("[data-loading='true']")
    return loading.isVisible()
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.container.locator("[data-loading='true']")).not.toBeVisible({ timeout: 5000 })
  }

  async scrollToBottom(): Promise<void> {
    await this.container.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
  }

  async scrollToTop(): Promise<void> {
    await this.container.evaluate((el) => {
      el.scrollTop = 0
    })
  }
}
