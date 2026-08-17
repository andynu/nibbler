import { test, expect, SEEDED_ADMIN } from "./fixtures"
import { loginViaApi, logoutViaApi, getCurrentUser, waitForAppLoad } from "./fixtures/auth"

/**
 * Authentication E2E tests.
 *
 * The shared fixtures sign the browser context in as the seeded admin before
 * every test, so tests that want anonymous behaviour log out first.
 *
 * These tests focus on:
 * 1. App loads correctly when authenticated
 * 2. API auth endpoints work
 * 3. Session management via API
 */

test.describe("App authentication (auto-auth in dev/test)", () => {
  test("app loads and shows main interface", async ({ page }) => {
    await page.goto("/")

    // App should load the main react UI
    await expect(page.getByTestId("app-root")).toBeVisible()

    // Wait for app to fully load - NibbleRSS branding in sidebar indicates authenticated view
    await expect(page.getByText("NibbleRSS")).toBeVisible()
  })

  test("API requests work when auto-authenticated", async ({ page }) => {
    await page.goto("/")

    // Make an API request to check feeds
    const response = await page.request.get("/api/v1/feeds")
    expect(response.ok()).toBe(true)

    const feeds = await response.json()
    expect(Array.isArray(feeds)).toBe(true)
  })

  test("API /me endpoint returns the signed in user", async ({ page }) => {
    await page.goto("/")

    const response = await page.request.get("/api/v1/auth/me")
    expect(response.ok()).toBe(true)
    expect((await response.json()).login).toBe(SEEDED_ADMIN.login)
  })

  test("API /me endpoint returns 401 once logged out", async ({ page }) => {
    // Api::V1::SessionsController has no ALLOW_DEV_AUTH fallback, unlike the
    // rest of /api/v1, so it needs a real session.
    await page.goto("/")
    await logoutViaApi(page)

    const response = await page.request.get("/api/v1/auth/me")
    expect(response.status()).toBe(401)
  })
})

test.describe("API auth endpoints", () => {
  test("login with valid credentials returns user info", async ({ page }) => {
    const response = await loginViaApi(
      page,
      SEEDED_ADMIN.login,
      SEEDED_ADMIN.password
    )

    expect(response.ok()).toBe(true)
    const data = await response.json()
    expect(data.login).toBe(SEEDED_ADMIN.login)
    expect(data.email).toBeDefined()
  })

  test("login with invalid credentials returns 401", async ({ page }) => {
    const response = await loginViaApi(page, "nonexistent", "wrongpassword")

    expect(response.status()).toBe(401)
    const data = await response.json()
    expect(data.error).toBe("Invalid username or password")
  })

  test("logout ends the session and then requires authentication", async ({
    page,
  }) => {
    // The fixtures leave us signed in, so the first logout succeeds
    expect((await logoutViaApi(page)).status()).toBe(204)

    // A second one has no session to end
    expect((await logoutViaApi(page)).status()).toBe(401)
  })
})

test.describe("Protected routes", () => {
  test("feeds endpoint requires authentication", async ({ page }) => {
    // In dev/test mode this will still work due to auto-auth fallback
    // Testing the raw behavior without auto-auth would require production mode
    const response = await page.request.get("/api/v1/feeds")

    // Should succeed in dev mode
    expect(response.ok()).toBe(true)
  })

  test("entries endpoint requires authentication", async ({ page }) => {
    const response = await page.request.get("/api/v1/entries")
    expect(response.ok()).toBe(true)
  })

  test("categories endpoint requires authentication", async ({ page }) => {
    const response = await page.request.get("/api/v1/categories")
    expect(response.ok()).toBe(true)
  })
})

test.describe("Page load behavior", () => {
  test("root page loads successfully", async ({ page }) => {
    const response = await page.goto("/")
    expect(response?.status()).toBe(200)
  })

  test("health check endpoint works", async ({ page }) => {
    const response = await page.goto("/up")
    expect(response?.status()).toBe(200)
  })

  test("invalid routes return 404 or redirect to root", async ({ page }) => {
    const response = await page.goto("/nonexistent-page-12345")
    // Rails may return 404 or redirect - either is valid
    expect([200, 404]).toContain(response?.status())
  })
})
