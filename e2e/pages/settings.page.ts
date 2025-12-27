import { type Page, type Locator, expect } from "@playwright/test"

/**
 * Page object for the Settings dialog.
 * Encapsulates all tabs and their content.
 */
export class SettingsPage {
  readonly page: Page
  readonly dialog: Locator
  readonly title: Locator
  readonly tabList: Locator
  readonly closeButton: Locator

  // Tab triggers
  readonly feedsTab: Locator
  readonly filtersTab: Locator
  readonly labelsTab: Locator
  readonly importExportTab: Locator
  readonly toolsTab: Locator
  readonly preferencesTab: Locator
  readonly accountTab: Locator

  constructor(page: Page) {
    this.page = page
    this.dialog = page.getByRole("dialog")
    this.title = page.getByText("Settings")
    this.tabList = page.getByRole("tablist")
    this.closeButton = page.getByRole("button", { name: /close/i })

    // Tabs
    this.feedsTab = page.getByRole("tab", { name: /feeds/i })
    this.filtersTab = page.getByRole("tab", { name: /filters/i })
    this.labelsTab = page.getByRole("tab", { name: /labels/i })
    this.importExportTab = page.getByRole("tab", { name: /import|export/i })
    this.toolsTab = page.getByRole("tab", { name: /tools/i })
    this.preferencesTab = page.getByRole("tab", { name: /preferences/i })
    this.accountTab = page.getByRole("tab", { name: /account/i })
  }

  async isVisible(): Promise<boolean> {
    return this.dialog.isVisible()
  }

  async waitForVisible(): Promise<void> {
    await expect(this.dialog).toBeVisible({ timeout: 2000 })
  }

  async close(): Promise<void> {
    await this.page.keyboard.press("Escape")
    await expect(this.dialog).not.toBeVisible()
  }

  // Tab navigation

  async goToFeedsTab(): Promise<void> {
    await this.feedsTab.click()
    await expect(this.feedsTab).toHaveAttribute("data-state", "active")
  }

  async goToFiltersTab(): Promise<void> {
    await this.filtersTab.click()
    await expect(this.filtersTab).toHaveAttribute("data-state", "active")
  }

  async goToLabelsTab(): Promise<void> {
    await this.labelsTab.click()
    await expect(this.labelsTab).toHaveAttribute("data-state", "active")
  }

  async goToImportExportTab(): Promise<void> {
    await this.importExportTab.click()
    await expect(this.importExportTab).toHaveAttribute("data-state", "active")
  }

  async goToToolsTab(): Promise<void> {
    await this.toolsTab.click()
    await expect(this.toolsTab).toHaveAttribute("data-state", "active")
  }

  async goToPreferencesTab(): Promise<void> {
    await this.preferencesTab.click()
    await expect(this.preferencesTab).toHaveAttribute("data-state", "active")
  }

  async goToAccountTab(): Promise<void> {
    await this.accountTab.click()
    await expect(this.accountTab).toHaveAttribute("data-state", "active")
  }

  async getActiveTab(): Promise<string | null> {
    const tabs = [
      { tab: this.feedsTab, name: "feeds" },
      { tab: this.filtersTab, name: "filters" },
      { tab: this.labelsTab, name: "labels" },
      { tab: this.importExportTab, name: "import-export" },
      { tab: this.toolsTab, name: "tools" },
      { tab: this.preferencesTab, name: "preferences" },
      { tab: this.accountTab, name: "account" },
    ]

    for (const { tab, name } of tabs) {
      const state = await tab.getAttribute("data-state")
      if (state === "active") return name
    }
    return null
  }

  // Preferences tab helpers

  async getThemeText(): Promise<Locator> {
    return this.page.getByText("Theme")
  }

  async getAppearanceSection(): Promise<Locator> {
    return this.page.getByText("Appearance")
  }

  async getArticleDisplaySection(): Promise<Locator> {
    return this.page.getByText("Article Display")
  }

  async getReadingBehaviorSection(): Promise<Locator> {
    return this.page.getByText("Reading Behavior")
  }

  async getDataManagementSection(): Promise<Locator> {
    return this.page.getByText("Data Management")
  }

  async getContentPreviewToggle(): Promise<Locator> {
    return this.page.getByRole("switch", { name: /content preview/i })
  }

  async toggleContentPreview(): Promise<void> {
    const toggle = await this.getContentPreviewToggle()
    await toggle.click()
  }

  async getStripImagesToggle(): Promise<Locator> {
    return this.page.getByRole("switch", { name: /images/i }).first()
  }

  async getConfirmMarkAllReadToggle(): Promise<Locator> {
    return this.page.getByRole("switch", { name: /confirm|mark.*read/i }).first()
  }
}
