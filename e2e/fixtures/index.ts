// Custom test fixtures
export { test, expect, SEEDED_ADMIN } from "./test"
export type { Page, Locator } from "./test"

// Auth helpers (for API-level auth)
export { loginViaApi, logoutViaApi, getCurrentUser, waitForAppLoad } from "./auth"
