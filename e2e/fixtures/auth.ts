import { type APIResponse, type Page } from "@playwright/test"

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
