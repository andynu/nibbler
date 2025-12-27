import { type Page, type Locator, expect } from "@playwright/test"

/**
 * Component for the feed sidebar interactions.
 */
export class SidebarComponent {
  readonly page: Page
  readonly container: Locator

  // Virtual feeds
  readonly allFeedsButton: Locator
  readonly freshButton: Locator
  readonly starredButton: Locator

  // Action buttons
  readonly settingsButton: Locator
  readonly subscribeButton: Locator
  readonly refreshButton: Locator

  constructor(page: Page) {
    this.page = page
    this.container = page.getByTestId("feed-sidebar")

    // Virtual feeds
    this.allFeedsButton = page.getByRole("button", { name: /all feeds/i }).first()
    this.freshButton = page.getByRole("button", { name: /fresh/i }).first()
    this.starredButton = page.getByRole("button", { name: /starred/i }).first()

    // Actions
    this.settingsButton = page.getByRole("button", { name: /settings|cog/i }).first()
    this.subscribeButton = page.getByRole("button", { name: /subscribe|add.*feed|plus/i }).first()
    this.refreshButton = page.getByRole("button", { name: /refresh/i })
  }

  async selectVirtualFeed(name: "all" | "fresh" | "starred"): Promise<void> {
    switch (name) {
      case "all":
        await this.allFeedsButton.click()
        break
      case "fresh":
        await this.freshButton.click()
        break
      case "starred":
        await this.starredButton.click()
        break
    }
  }

  async selectFeed(name: string): Promise<void> {
    const feedButton = this.page.getByRole("button", { name })
    await feedButton.click()
  }

  async selectCategory(name: string): Promise<void> {
    const categoryButton = this.page.getByRole("button", { name })
    await categoryButton.click()
  }

  async openSettings(): Promise<void> {
    await this.settingsButton.click()
    await expect(this.page.getByRole("dialog")).toBeVisible({ timeout: 2000 })
  }

  async openSubscribe(): Promise<void> {
    await this.subscribeButton.click()
    await expect(this.page.getByRole("dialog")).toBeVisible({ timeout: 2000 })
  }

  async refresh(): Promise<void> {
    await this.refreshButton.click()
  }

  async isCollapsed(): Promise<boolean> {
    // Check if sidebar is in collapsed state (narrow width)
    const width = await this.container.evaluate((el) => el.clientWidth)
    return width < 100 // Collapsed is typically ~48px
  }

  async toggle(): Promise<void> {
    // Press 'b' to toggle sidebar
    await this.page.keyboard.press("b")
  }
}
