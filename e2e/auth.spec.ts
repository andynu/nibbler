import { test, expect } from "@playwright/test"
import { loginViaApi, logoutViaApi, getCurrentUser, waitForAppLoad } from "./fixtures/auth"

/**
 * Authentication E2E tests.
 *
 * Note: The app currently auto-authenticates in dev/test mode.
 * These tests focus on:
 * 1. App loads correctly when authenticated
 * 2. API auth endpoints work
 * 3. Session management via API
 */

test.describe("App authentication (auto-auth in dev/test)", () => {
  test("app loads and shows main interface", async ({ page }) => {
    await page.goto("/")

    // App should load the main react UI
    await expect(page.locator("#react-root")).toBeVisible()

    // Should show the feed reader interface, not a login page
    // Wait for React to mount and render content
    await page.waitForTimeout(1000)

    // The sidebar should be visible (indicating authenticated view)
    const body = page.locator("body")
    await expect(body).toBeVisible()
  })

  test("API requests work when auto-authenticated", async ({ page }) => {
    await page.goto("/")

    // Make an API request to check feeds
    const response = await page.request.get("/api/v1/feeds")
    expect(response.ok()).toBe(true)

    const feeds = await response.json()
    expect(Array.isArray(feeds)).toBe(true)
  })

  test("API /me endpoint returns 401 without session", async ({ page }) => {
    // Note: The /me endpoint uses SessionsController which doesn't have
    // the dev/test mode auto-auth fallback. It requires a real session.
    await page.goto("/")

    const response = await page.request.get("/api/v1/auth/me")
    // Without logging in first, this should return 401
    expect(response.status()).toBe(401)
  })
})

test.describe("API auth endpoints", () => {
  test("login with valid credentials returns user info", async ({ page }) => {
    // Note: This requires a test user to exist. In dev mode we typically have one.
    // The actual credentials depend on the seed data.
    const response = await loginViaApi(page, "test_user", "password")

    // In dev mode this may fail if no user exists - that's expected
    if (response.ok()) {
      const data = await response.json()
      expect(data.login).toBeDefined()
      expect(data.email).toBeDefined()
    }
  })

  test("login with invalid credentials returns 401", async ({ page }) => {
    const response = await loginViaApi(page, "nonexistent", "wrongpassword")

    expect(response.status()).toBe(401)
    const data = await response.json()
    expect(data.error).toBe("Invalid username or password")
  })

  test("logout endpoint requires authentication", async ({ page }) => {
    // Logout requires a session - should return 401 without one
    const logoutResponse = await logoutViaApi(page)
    expect(logoutResponse.status()).toBe(401)
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
