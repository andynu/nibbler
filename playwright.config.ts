import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT ?? '3001';
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // The suite shares one database and every spec resets it to the fixture set
  // before each test (see e2e/fixtures/test.ts), so examples must not overlap.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: BASE_URL,
    testIdAttribute: 'data-testid',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Reduce unnecessary waits for faster tests
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },
  // Fail fast on first failure in CI to save time
  maxFailures: process.env.CI ? 5 : undefined,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Browse mode is the one feature here whose correctness is browser
    // behaviour rather than application logic: cross-origin framing, focus
    // crossing a document boundary, and what a frame does when its src changes.
    // Chromium and Firefox genuinely disagree there - Firefox fires no window
    // blur when focus moves into a cross-origin frame - so these specs are the
    // ones worth paying a second browser for. The rest of the suite is
    // Chromium-only; widening it is ttrb-6yuw.
    {
      name: 'firefox',
      testMatch: [
        '**/iframe-keyboard-focus.spec.ts',
        '**/embed-block-fallback.spec.ts',
        '**/focus-mode-nav.spec.ts',
      ],
      use: { ...devices['Desktop Firefox'] },
    },
  ],
  webServer: {
    // bin/e2e-server pins RAILS_ENV, the database, dev auth and offline feed
    // fetching; see the comments there. Never reuse an already-running server:
    // a developer's bin/dev on port 3000 has none of that, which is what made
    // this suite unfit for CI in the first place.
    command: 'bin/e2e-server',
    url: `${BASE_URL}/up`,
    reuseExistingServer: false,
    // Covers asset build, database prepare and seed as well as boot.
    timeout: 180 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
