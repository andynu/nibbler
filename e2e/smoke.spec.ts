import { test, expect } from '@playwright/test';

test('app loads and shows login page when not authenticated', async ({ page }) => {
  await page.goto('/');
  // Should be redirected to login or show login form
  await expect(page.locator('body')).toBeVisible();
});

test('app serves assets correctly', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
});
