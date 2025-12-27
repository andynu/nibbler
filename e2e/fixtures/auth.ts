import { Page, expect } from "@playwright/test"

/**
 * Auth helpers for E2E tests.
 *
 * Note: In development/test mode, the app auto-authenticates to the first user.
 * These helpers are for when a login UI is implemented or for API-level auth.
 */

/**
 * Login via API endpoint
 */
export async function loginViaApi(
  page: Page,
  login: string,
  password: string
): Promise<Response> {
  const response = await page.request.post("/api/v1/auth/login", {
    data: { login, password },
  })
  return response
}

/**
 * Logout via API endpoint
 */
export async function logoutViaApi(page: Page): Promise<Response> {
  const response = await page.request.delete("/api/v1/auth/logout")
  return response
}

/**
 * Get current user from API
 */
export async function getCurrentUser(page: Page) {
  const response = await page.request.get("/api/v1/auth/me")
  if (response.ok()) {
    return await response.json()
  }
  return null
}

/**
 * Wait for app to fully load (auto-authenticated in dev/test)
 */
export async function waitForAppLoad(page: Page) {
  await page.goto("/")
  // The app should load and show the main UI
  await expect(page.locator("#react-root")).toBeVisible()
  // Wait for React to mount and load initial data
  await page.waitForSelector('[data-testid="feed-sidebar"], .sidebar, nav', {
    timeout: 10000,
  }).catch(() => {
    // If no sidebar yet, at least wait for content
  })
}
