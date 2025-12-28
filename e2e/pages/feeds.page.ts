import { type Page, type Locator, expect } from "@playwright/test"
import { BasePage } from "./base.page"

/**
 * Page object for the main Feeds view.
 * Encapsulates the three-pane layout: sidebar, entry list, and content area.
 */
export class FeedsPage extends BasePage {
  // Sidebar elements
  readonly sidebar: Locator
  readonly allFeedsButton: Locator
  readonly freshButton: Locator
  readonly starredButton: Locator
  readonly settingsButton: Locator
  readonly subscribeButton: Locator
  readonly refreshButton: Locator

  // Entry list elements
  readonly entryList: Locator

  // Content area elements
  readonly contentArea: Locator

  constructor(page: Page) {
    super(page)

    // Sidebar
    this.sidebar = page.getByTestId("feed-sidebar")
    this.allFeedsButton = page.getByRole("button", { name: /all feeds/i }).first()
    this.freshButton = page.getByRole("button", { name: /fresh/i }).first()
    this.starredButton = page.getByRole("button", { name: /starred/i }).first()
    this.settingsButton = page.getByRole("button", { name: /settings|cog/i }).first()
    this.subscribeButton = page.getByRole("button", { name: /subscribe|add.*feed|plus/i }).first()
    this.refreshButton = page.getByRole("button", { name: /refresh/i })

    // Entry list
    this.entryList = page.getByTestId("entry-list")

    // Content
    this.contentArea = page.getByTestId("entry-content")
  }

  async goto(): Promise<void> {
    await this.page.goto("/")
    await this.waitForReady()
  }

  /**
   * Wait for the app branding to be visible (confirms full load)
   */
  async waitForBranding(): Promise<void> {
    await expect(this.page.getByText("NibbleRSS")).toBeVisible({ timeout: 10000 })
  }

  // Navigation actions

  async selectAllFeeds(): Promise<void> {
    await this.allFeedsButton.click()
    await expect(this.allFeedsButton).toBeVisible()
  }

  async selectFresh(): Promise<void> {
    await this.freshButton.click()
    await expect(this.freshButton).toBeVisible()
  }

  async selectStarred(): Promise<void> {
    await this.starredButton.click()
    await expect(this.starredButton).toBeVisible()
  }

  async selectFeedByName(name: string): Promise<void> {
    const feedButton = this.page.getByRole("button", { name })
    await feedButton.click()
    await expect(feedButton).toBeVisible()
  }

  async selectCategoryByName(name: string): Promise<void> {
    const categoryButton = this.page.getByRole("button", { name })
    await categoryButton.click()
    await expect(categoryButton).toBeVisible()
  }

  // Dialog actions

  async openSettings(): Promise<void> {
    await this.settingsButton.click()
    await expect(this.page.getByRole("dialog")).toBeVisible({ timeout: 2000 })
  }

  async openSubscribeDialog(): Promise<void> {
    await this.subscribeButton.click()
    await expect(this.page.getByRole("dialog")).toBeVisible({ timeout: 2000 })
  }

  // Feed actions

  async refresh(): Promise<void> {
    await this.refreshButton.click()
  }

  // Entry actions

  async selectEntryByTitle(title: string): Promise<void> {
    await this.page.getByText(title).click()
  }

  async getEntryTitles(): Promise<string[]> {
    const entries = this.entryList.locator("[data-entry-title]")
    const count = await entries.count()
    const titles: string[] = []
    for (let i = 0; i < count; i++) {
      const title = await entries.nth(i).getAttribute("data-entry-title")
      if (title) titles.push(title)
    }
    return titles
  }

  // Keyboard shortcuts

  async pressKey(key: string): Promise<void> {
    await this.page.keyboard.press(key)
  }

  async navigateNextEntry(): Promise<void> {
    await this.pressKey("j")
  }

  async navigatePreviousEntry(): Promise<void> {
    await this.pressKey("k")
  }

  async toggleReadStatus(): Promise<void> {
    await this.pressKey("m")
  }

  async toggleStarred(): Promise<void> {
    await this.pressKey("s")
  }

  async openOriginalLink(): Promise<void> {
    await this.pressKey("v")
  }
}
