import { test as base, expect, type Page } from "@playwright/test"
import { FeedsPage } from "../pages/feeds.page"
import { SettingsPage } from "../pages/settings.page"
import { CommandPalettePage } from "../pages/command-palette.page"

/** Credentials of the account E2eDataset seeds (see lib/e2e_dataset.rb). */
export const SEEDED_ADMIN = { login: "admin", password: "password" } as const

/**
 * Custom test fixtures for E2E tests.
 *
 * Fixtures provide pre-configured page objects that are automatically
 * set up and torn down for each test.
 *
 * Every spec file must import `test` from here rather than from
 * "@playwright/test": the seededDatabase fixture below is what keeps examples
 * from seeing each other's writes.
 */

type Fixtures = {
  /**
   * Restores the deterministic fixture set before every test.
   *
   * The specs star articles, mark everything read, and create and delete feeds,
   * categories and tags, all against one shared database. This runs first so
   * each example starts from the same data regardless of what ran before it.
   */
  seededDatabase: void

  /**
   * Signs the browser context in as the seeded admin before every test.
   *
   * The server has no authentication bypass: every /api/v1 endpoint, including
   * the /auth/me the React app calls on boot to decide between the login form
   * and the reader, needs a real session. Without one the app renders the login
   * form and every UI assertion fails, so the suite logs in for real. Specs
   * that need an anonymous context call logoutViaApi first.
   */
  signedIn: void

  /**
   * FeedsPage fixture - navigates to the app and waits for it to load.
   */
  feedsPage: FeedsPage

  /**
   * SettingsPage fixture - provides access to settings dialog interactions.
   * Note: Dialog must be opened manually using feedsPage.openSettings().
   */
  settingsPage: SettingsPage

  /**
   * CommandPalettePage fixture - provides command palette interactions.
   * Note: Palette must be opened manually using commandPalette.open().
   */
  commandPalette: CommandPalettePage

  /**
   * Authenticated page fixture - navigates to app and ensures it's ready.
   * The session comes from the signedIn fixture above.
   */
  authenticatedPage: Page
}

// A fixture declares what it depends on by destructuring it, whether or not it
// then uses the value: Playwright reads the dependency names out of the
// function's source text. `noUnusedLocals` sees only a binding nobody reads, so
// dependencies that exist purely for their ordering effect are renamed to an
// underscore. Playwright takes the name before the colon, so the dependency is
// unchanged; renaming the whole property would silently drop it.
export const test = base.extend<Fixtures>({
  seededDatabase: [
    async ({ request }, use) => {
      const response = await request.post("/e2e/reset")

      if (!response.ok()) {
        throw new Error(
          `POST /e2e/reset returned ${response.status()}. The suite must run ` +
            `against a server started by bin/e2e-server; see playwright.config.ts.`
        )
      }

      await use()
    },
    { auto: true },
  ],

  signedIn: [
    async ({ seededDatabase: _seededDatabase, page }, use) => {
      // page.request shares the browser context's cookie jar, so the session
      // this creates is the one the app sees when the page loads.
      const response = await page.request.post("/api/v1/auth/login", {
        data: { login: SEEDED_ADMIN.login, password: SEEDED_ADMIN.password },
      })

      if (!response.ok()) {
        throw new Error(
          `Could not sign in as ${SEEDED_ADMIN.login}: ${response.status()}. ` +
            `Check that E2eDataset seeded the admin user.`
        )
      }

      // FeedSidebar reads its expanded-folder set from localStorage. Empty
      // storage now expands every folder once the categories request returns,
      // so this seeding is no longer load-bearing for visibility; it stays as
      // an explicit precondition so specs do not depend on that default.
      const categoriesResponse = await page.request.get("/api/v1/categories")
      const categories = categoriesResponse.ok()
        ? ((await categoriesResponse.json()) as Array<{ id: number }>)
        : []

      await page.addInitScript((ids: number[]) => {
        window.localStorage.setItem("nibbler:expandedCategories", JSON.stringify(ids))
        window.localStorage.setItem("nibbler:tagsExpanded", "true")
      }, categories.map((category) => category.id))

      await use()
    },
    { auto: true },
  ],

  feedsPage: async ({ signedIn: _signedIn, page }, use) => {
    const feedsPage = new FeedsPage(page)
    await feedsPage.goto()
    await use(feedsPage)
  },

  settingsPage: async ({ page }, use) => {
    const settingsPage = new SettingsPage(page)
    await use(settingsPage)
  },

  commandPalette: async ({ page }, use) => {
    const commandPalette = new CommandPalettePage(page)
    await use(commandPalette)
  },

  authenticatedPage: async ({ signedIn: _signedIn, page }, use) => {
    await page.goto("/")
    // Wait for app to be ready
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
    await use(page)
  },
})

export { expect } from "@playwright/test"
export type { Page, Locator } from "@playwright/test"
