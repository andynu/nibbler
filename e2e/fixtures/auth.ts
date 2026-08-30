import { type APIResponse, type Page, expect } from "@playwright/test"

/**
 * Auth helpers for E2E tests.
 *
 * The server has no authentication bypass, so the session these drive is the
 * only thing standing between a spec and a page full of 401s. The signedIn
 * fixture calls loginViaApi before every test.
 */

/**
 * Login via API endpoint.
 *
 * Returns Playwright's APIResponse, not the DOM Response: `ok` and `status`
 * are methods here, not properties.
 */
export async function loginViaApi(
  page: Page,
  login: string,
  password: string
): Promise<APIResponse> {
  const response = await page.request.post("/api/v1/auth/login", {
    data: { login, password },
  })
  return response
}

/**
 * Logout via API endpoint
 */
export async function logoutViaApi(page: Page): Promise<APIResponse> {
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
 * Wait for app to fully load (the signedIn fixture supplies the session)
 */
export async function waitForAppLoad(page: Page) {
  await page.goto("/")
  // The app should load and show the main UI
  await expect(page.getByTestId("app-root")).toBeVisible()
  // Wait for React to mount - app should show buttons when loaded
  await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
}
