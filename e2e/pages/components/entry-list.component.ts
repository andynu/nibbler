import { type Page, type Locator, expect } from "@playwright/test"

/**
 * Component for the entry list interactions.
 *
 * Every locator here resolves against something EntryList actually renders:
 * the "Entries" listbox, its role=option rows, the h2 in the title bar, and the
 * "Loading entries" status region. The attribute hooks these helpers used to
 * reach for (data-testid=entry-list, data-loading, data-selected,
 * data-list-title) were never emitted by the app, so the helpers silently
 * no-opped instead of failing.
 */
export class EntryListComponent {
  readonly page: Page
  readonly container: Locator
  readonly entries: Locator
  readonly markAllReadButton: Locator
  readonly title: Locator
  readonly loadingPlaceholder: Locator

  /**
   * The selected row. Selection is exposed as aria-selected on the option
   * itself. This is a Locator rather than a resolved element because React
   * commits the aria-selected flip after the click promise settles, so anything
   * that reads a count up front reports "nothing selected"; assert on it with
   * expect() and let Playwright retry.
   */
  readonly selectedEntry: Locator

  /**
   * The scrolling element. EntryList wraps its rows in a Radix ScrollArea, so
   * the listbox itself never scrolls - the viewport around it does.
   */
  private readonly scrollViewport: Locator

  constructor(page: Page) {
    this.page = page
    this.container = page.getByRole("listbox", { name: "Entries" })
    this.entries = this.container.getByRole("option")
    // Exact: /mark.*read/i also matches the per-entry "Mark as read" and
    // "Mark as unread" buttons, which is a strict-mode violation.
    this.markAllReadButton = page.getByRole("button", { name: "Mark read", exact: true })
    // The list title bar is the only level-2 heading in the reader shell; the
    // others belong to dialogs, which Radix portals to the end of the body.
    this.title = page.getByRole("heading", { level: 2 }).first()
    // Named status region: the article pane renders a bare "Loading..." of its
    // own, so matching on text alone can resolve to the wrong pane.
    this.loadingPlaceholder = page.getByRole("status", { name: "Loading entries" })
    this.selectedEntry = this.container.locator("[role='option'][aria-selected='true']")
    this.scrollViewport = page
      .locator("[data-slot='scroll-area-viewport']")
      .filter({ has: this.container })
  }

  async getEntryCount(): Promise<number> {
    return this.entries.count()
  }

  async selectEntryByIndex(index: number): Promise<void> {
    await this.entries.nth(index).click()
  }

  async selectEntryByTitle(title: string): Promise<void> {
    await this.container.getByText(title, { exact: true }).click()
  }

  async markAllAsRead(): Promise<void> {
    await this.markAllReadButton.click()
  }

  async getListTitle(): Promise<string | null> {
    return this.title.textContent()
  }

  async isLoading(): Promise<boolean> {
    return this.loadingPlaceholder.isVisible()
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.loadingPlaceholder).toBeHidden({ timeout: 5000 })
  }

  async scrollToBottom(): Promise<void> {
    await this.scrollViewport.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
  }

  async scrollToTop(): Promise<void> {
    await this.scrollViewport.evaluate((el) => {
      el.scrollTop = 0
    })
  }
}
