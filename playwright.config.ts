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
  // Every spec runs in both engines. Firefox started out on the three
  // browse-mode specs alone, on the argument that cross-origin framing and
  // focus crossing a document boundary were the only places the engines
  // disagreed. Running the rest under Firefox disproved that: the suite went
  // green after one fix, and the defect it turned up (e2e/auth.spec.ts, a
  // pre-logout Set-Cookie racing the logout) was invisible under Chromium, as
  // ttrb-ngol's focus-guard defect had been.
  //
  // Measured on one machine at 233s narrow against 491s wide, so the second
  // engine costs about four and a quarter minutes of the test_e2e job. A
  // curated middle - Firefox on the keyboard, theme and browser-history specs
  // only - would save perhaps half of that and go stale the first time someone
  // adds a spec file, silently, which is the failure this list started as.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
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
