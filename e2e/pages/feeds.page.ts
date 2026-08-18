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

    // Sidebar. FeedSidebar renders its root as the "Feeds" navigation landmark
    // in both the collapsed and expanded layouts, and only one of them is
    // mounted at a time.
    this.sidebar = page.getByRole("navigation", { name: "Feeds" })
    // Anchored and case-sensitive: the virtual-folder buttons are named after
    // the folder plus its count ("All Feeds15"), and the loose forms collided
    // with sidebar toggles that happen to contain the same words - /all feeds/i
    // matched "Show all feeds" and /fresh/i matched "Refresh all feeds", both
    // of which sort ahead of the folder list, so .first() clicked the toggle.
    this.allFeedsButton = page.getByRole("button", { name: /^All Feeds/ })
    this.freshButton = page.getByRole("button", { name: /^Fresh/ })
    this.starredButton = page.getByRole("button", { name: /^Starred/ })
    this.settingsButton = page.getByRole("button", { name: /settings|cog/i }).first()
    this.subscribeButton = page.getByRole("button", { name: /subscribe|add.*feed|plus/i }).first()
    this.refreshButton = page.getByRole("button", { name: /refresh/i })

    // Entry list. The listbox wraps the rendered entries, so it is absent while
    // the list is loading, empty, or showing feeds instead of entries - which is
    // what callers asserting on entries want.
    this.entryList = page.getByRole("listbox", { name: "Entries" })

    // Content. EntryContent renders an <article> once an entry is selected.
    this.contentArea = page.getByRole("article")
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
    // Scoped to the list: the same headline also appears in the article pane
    // once an entry is open, and an unscoped getByText would go strict-mode
    // ambiguous the moment a second entry is selected.
    await this.entryList.getByText(title, { exact: true }).click()
  }

  async getEntryTitles(): Promise<string[]> {
    // EntryItem carries the headline on data-entry-title. Reading the attribute
    // beats reading text content, which also picks up the preview, feed name,
    // date and tag badges at the wider display densities.
    return this.entryList
      .getByRole("option")
      .evaluateAll((rows) =>
        rows.map((row) => row.getAttribute("data-entry-title") ?? "").filter((title) => title !== "")
      )
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
