import { expect, test } from '@playwright/test';

test('desktop owner can navigate the primary library views', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Desktop-specific assertion');
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  await page
    .getByRole('complementary', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Search' })
    .click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole('heading', { name: 'Find your next watch.' })).toBeVisible();
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByRole('heading', { name: 'Watch history.' })).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('link', { name: /Download JSON/ })).toBeVisible();
});

test('mobile navigation exposes the core tracker journey', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobile-specific assertion');
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(navigation.getByRole('link', { name: 'Import' })).toBeVisible();
  await navigation.getByRole('link', { name: 'Watchlist' }).click();
  await expect(page.getByRole('heading', { name: 'Your watchlist.' })).toBeVisible();
});
