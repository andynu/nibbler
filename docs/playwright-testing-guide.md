# Playwright Testing Guide

This document outlines the testing methodologies and best practices for writing robust, maintainable Playwright E2E tests in this project.

## Core Principles

### 1. Test Isolation

Each test must run independently with its own browser context, local storage, session storage, and cookies.

```typescript
// Playwright creates isolated browser contexts automatically
// Each test.() gets a fresh `page` fixture
test('user can log in', async ({ page }) => {
  // This page is completely isolated from other tests
})
```

**Why it matters:**
- No cascading failures between tests
- Tests can run in parallel safely
- Easier debugging - failures are self-contained
- No cleanup code needed between tests

### 2. User-Centric Testing

Tests should verify what end users see and interact with, avoiding implementation details.

```typescript
// Good - tests user-visible behavior
await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
await expect(page.getByText('Changes saved')).toBeVisible()

// Bad - tests implementation details
await expect(page.locator('.btn-primary.save-btn')).toBeVisible()
await expect(page.locator('#toast-container')).toHaveClass('success')
```

## Locator Strategy

Use this priority when selecting elements:

### Priority 1: Role-Based Locators (Preferred)

```typescript
// Best - mirrors how users and assistive technologies perceive the page
page.getByRole('button', { name: 'Submit' })
page.getByRole('textbox', { name: 'Email' })
page.getByRole('link', { name: 'Settings' })
page.getByRole('checkbox', { name: 'Remember me' })
```

### Priority 2: Text and Label Locators

```typescript
page.getByText('Welcome back')
page.getByLabel('Password')
page.getByPlaceholder('Search feeds...')
```

### Priority 3: Test IDs (When Semantic Locators Insufficient)

```typescript
// Use when role/text locators aren't practical
page.getByTestId('feed-list')
page.getByTestId('entry-content')
```

**Configure custom test ID attribute in `playwright.config.ts`:**

```typescript
export default defineConfig({
  use: {
    testIdAttribute: 'data-testid',
  },
})
```

### Avoid These Locators

```typescript
// Fragile - breaks with styling changes
page.locator('.btn-primary')
page.locator('#submit-button')

// Fragile - breaks with DOM restructuring
page.locator('div > form > button:first-child')
page.locator('//div[@class="container"]/button')
```

## Auto-Waiting & Assertions

### Let Playwright Wait Automatically

Playwright's auto-waiting handles most synchronization. Never use hard waits.

```typescript
// Bad - arbitrary delay
await page.waitForTimeout(2000)
await page.click('button')

// Good - Playwright waits for element to be actionable
await page.getByRole('button', { name: 'Submit' }).click()
```

### Use Web-First Assertions

Web-first assertions automatically retry until the condition is met:

```typescript
// These retry automatically (up to expect timeout)
await expect(page.getByText('Success')).toBeVisible()
await expect(page.getByRole('list')).toHaveCount(5)
await expect(page.getByTestId('status')).toHaveText('Complete')

// Wait for specific conditions
await expect(page.getByRole('button')).toBeEnabled()
await expect(page.getByRole('dialog')).toBeHidden()
```

### Handle Network Requests

```typescript
// Wait for API response before asserting
await page.getByRole('button', { name: 'Save' }).click()
await page.waitForResponse(resp =>
  resp.url().includes('/api/feeds') && resp.status() === 200
)
await expect(page.getByText('Saved')).toBeVisible()
```

### Handle Animations

```typescript
// Option 1: Disable animations globally in config
export default defineConfig({
  use: {
    // Disable CSS animations and transitions
    launchOptions: {
      args: ['--disable-animations'],
    },
  },
})

// Option 2: Wait for animation to complete
await page.getByRole('dialog').waitFor({ state: 'visible' })
await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1')
```

## Page Object Model

Organize tests using the Page Object Model pattern.

### Structure

```
e2e/
├── pages/
│   ├── login.page.ts
│   ├── feeds.page.ts
│   ├── settings.page.ts
│   └── components/
│       ├── sidebar.component.ts
│       └── entry-list.component.ts
├── fixtures/
│   └── test.ts
├── tests/
│   ├── auth.spec.ts
│   ├── feeds.spec.ts
│   └── settings.spec.ts
└── playwright.config.ts
```

### Page Object Example

```typescript
// e2e/pages/feeds.page.ts
import { Page, Locator } from '@playwright/test'

export class FeedsPage {
  readonly page: Page
  readonly sidebar: Locator
  readonly entryList: Locator
  readonly entryContent: Locator
  readonly refreshButton: Locator

  constructor(page: Page) {
    this.page = page
    this.sidebar = page.getByTestId('feed-sidebar')
    this.entryList = page.getByTestId('entry-list')
    this.entryContent = page.getByTestId('entry-content')
    this.refreshButton = page.getByRole('button', { name: 'Refresh' })
  }

  async goto() {
    await this.page.goto('/')
  }

  async selectFeed(name: string) {
    await this.sidebar.getByRole('button', { name }).click()
  }

  async selectEntry(title: string) {
    await this.entryList.getByText(title).click()
  }

  async refresh() {
    await this.refreshButton.click()
    await this.page.waitForResponse(resp =>
      resp.url().includes('/api/feeds/refresh')
    )
  }
}
```

### Using Page Objects in Tests

```typescript
// e2e/tests/feeds.spec.ts
import { test, expect } from '@playwright/test'
import { FeedsPage } from '../pages/feeds.page'

test.describe('Feed Reading', () => {
  let feedsPage: FeedsPage

  test.beforeEach(async ({ page }) => {
    feedsPage = new FeedsPage(page)
    await feedsPage.goto()
  })

  test('can select and read an entry', async ({ page }) => {
    await feedsPage.selectFeed('Tech News')
    await feedsPage.selectEntry('Latest Article')

    await expect(feedsPage.entryContent).toContainText('Latest Article')
  })
})
```

## Fixtures

### Custom Fixtures for Common Setup

```typescript
// e2e/fixtures/test.ts
import { test as base } from '@playwright/test'
import { FeedsPage } from '../pages/feeds.page'
import { SettingsPage } from '../pages/settings.page'

type Fixtures = {
  feedsPage: FeedsPage
  settingsPage: SettingsPage
}

export const test = base.extend<Fixtures>({
  feedsPage: async ({ page }, use) => {
    const feedsPage = new FeedsPage(page)
    await feedsPage.goto()
    await use(feedsPage)
  },

  settingsPage: async ({ page }, use) => {
    const settingsPage = new SettingsPage(page)
    await use(settingsPage)
  },
})

export { expect } from '@playwright/test'
```

### Authentication Fixture

```typescript
// e2e/fixtures/auth.ts
import { test as base } from '@playwright/test'

export const test = base.extend({
  // Reuse authentication state across tests
  storageState: async ({}, use) => {
    await use('e2e/.auth/user.json')
  },
})

// Generate auth state in global setup
// e2e/global-setup.ts
async function globalSetup() {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  await page.goto('/login')
  await page.getByLabel('Email').fill('test@example.com')
  await page.getByLabel('Password').fill('password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await page.context().storageState({ path: 'e2e/.auth/user.json' })
  await browser.close()
}
```

## Test Organization

### Keep Tests Focused

Each test should verify one specific behavior:

```typescript
// Good - focused tests
test('displays unread count badge', async ({ feedsPage }) => {
  await expect(feedsPage.sidebar.getByText('5')).toBeVisible()
})

test('marks entry as read when selected', async ({ feedsPage }) => {
  await feedsPage.selectEntry('Unread Article')
  await expect(feedsPage.entryList.getByText('Unread Article'))
    .not.toHaveClass(/unread/)
})

// Bad - testing too much in one test
test('feed reading workflow', async ({ feedsPage }) => {
  // 50 lines testing multiple behaviors...
})
```

### Descriptive Test Names

```typescript
test.describe('Entry List', () => {
  test('shows loading spinner while fetching entries', ...)
  test('displays "No entries" when feed is empty', ...)
  test('highlights selected entry with accent color', ...)
  test('scrolls selected entry into view on keyboard navigation', ...)
})
```

### Group Related Tests

```typescript
test.describe('Keyboard Navigation', () => {
  test.describe('Entry List', () => {
    test('j moves to next entry', ...)
    test('k moves to previous entry', ...)
    test('o opens entry in new tab', ...)
  })

  test.describe('Feed Sidebar', () => {
    test('J moves to next feed', ...)
    test('K moves to previous feed', ...)
  })
})
```

## Mocking & Network Control

### Mock API Responses

```typescript
test('handles API errors gracefully', async ({ page }) => {
  await page.route('**/api/feeds', route => {
    route.fulfill({
      status: 500,
      body: JSON.stringify({ error: 'Server error' }),
    })
  })

  await page.goto('/')
  await expect(page.getByText('Failed to load feeds')).toBeVisible()
})
```

### Mock Specific Responses

```typescript
test('displays empty state when no feeds', async ({ page }) => {
  await page.route('**/api/feeds', route => {
    route.fulfill({
      status: 200,
      body: JSON.stringify([]),
    })
  })

  await page.goto('/')
  await expect(page.getByText('No feeds yet')).toBeVisible()
})
```

## Debugging

### Use Playwright Tools

```bash
# Run with UI mode for debugging
npx playwright test --ui

# Run with headed browser
npx playwright test --headed

# Run with Playwright Inspector
npx playwright test --debug

# Generate tests by recording
npx playwright codegen localhost:3000
```

### Traces for CI Failures

```typescript
// playwright.config.ts
export default defineConfig({
  use: {
    trace: 'on-first-retry', // Capture trace on failure
    video: 'on-first-retry', // Record video on failure
    screenshot: 'only-on-failure',
  },
})
```

## Configuration Reference

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/tests',

  // Run tests in parallel
  fullyParallel: true,

  // Fail build on CI if test.only left in code
  forbidOnly: !!process.env.CI,

  // Retry failed tests
  retries: process.env.CI ? 2 : 0,

  // Limit parallel workers on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: 'http://localhost:3000',
    testIdAttribute: 'data-testid',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Start dev server before tests
  webServer: {
    command: 'bin/dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

## Quick Reference

| Do | Don't |
|----|-------|
| Use `getByRole()` | Use CSS selectors |
| Use `getByTestId()` as fallback | Use XPath |
| Let Playwright auto-wait | Use `waitForTimeout()` |
| Use web-first assertions | Use `page.$()` for assertions |
| Keep tests focused (one behavior) | Test entire workflows in one test |
| Use Page Object Model | Duplicate locators across tests |
| Mock external APIs | Depend on external services |
| Run tests in isolation | Share state between tests |

## Resources

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Page Object Models](https://playwright.dev/docs/pom)
- [Test Fixtures](https://playwright.dev/docs/test-fixtures)
- [Locators Guide](https://playwright.dev/docs/locators)
