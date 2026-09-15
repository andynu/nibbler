// Custom test fixtures
export { test, expect, SEEDED_ADMIN } from "./test"
export type { Page, Locator } from "./test"

// A ready, silent clip in place of the TTS service
export { stubTtsAudio } from "./audio"

// Auth helpers (for API-level auth)
export { loginViaApi, logoutViaApi, getCurrentUser, waitForAppLoad } from "./auth"
