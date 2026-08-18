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
    // FeedSidebar's root is the "Feeds" navigation landmark in both the
    // collapsed and expanded layouts, and only one is mounted at a time.
    this.container = page.getByRole("navigation", { name: "Feeds" })

    // Virtual feeds. Anchored and case-sensitive: /all feeds/i also matched the
    // "Show all feeds" toggle and /fresh/i the "Refresh all feeds" button, both
    // of which precede the folder list, so .first() clicked the wrong control.
    this.allFeedsButton = page.getByRole("button", { name: /^All Feeds/ })
    this.freshButton = page.getByRole("button", { name: /^Fresh/ })
    this.starredButton = page.getByRole("button", { name: /^Starred/ })

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
    // The collapsed layout offers "Expand sidebar" and the expanded one
    // "Collapse sidebar", and the swap is synchronous with the state change.
    // Measuring clientWidth instead raced the 150ms width transition and
    // reported the sidebar as expanded for the first frames after collapsing.
    return this.container.getByRole("button", { name: "Expand sidebar" }).isVisible()
  }

  async toggle(): Promise<void> {
    // Press 'b' to toggle sidebar
    await this.page.keyboard.press("b")
  }
}
