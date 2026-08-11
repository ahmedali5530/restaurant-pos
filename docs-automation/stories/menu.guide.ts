import { test, expect } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import {
  ensureFloorMenuMode,
  loginWithPin,
  openMenuOrdering,
  reloadAppCache,
  resetSession,
  waitForDishes,
} from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture floor, covers, and menu ordering screens', async ({ page }) => {
  test.setTimeout(240_000);
  await resetSession(page);
  await loginWithPin(page);
  await reloadAppCache(page);
  await ensureFloorMenuMode(page);

  await page.goto('/menu');
  await page.waitForTimeout(1_500);

  await expect(page.getByTestId('menu-floor')).toBeVisible({ timeout: 45_000 });
  const table = page.getByTestId('floor-table').first();
  await expect(table, {
    message: 'Floor tables required for menu-floor.png — seed floors/tables then reload cache.',
  }).toBeVisible({ timeout: 45_000 });

  await highlightAndReady(page, page.getByTestId('menu-floor'));
  await capturePage(page, 'menu-floor', { fullPage: false });
  await clearHighlights(page);

  await highlightAndReady(page, table);
  await captureLocator(table, 'menu-floor-table');
  await clearHighlights(page);

  await table.click({ force: true });
  await page.waitForTimeout(600);

  const persons = page.getByTestId('menu-persons-screen');
  if (await persons.isVisible().catch(() => false)) {
    await highlightAndReady(page, persons);
    await capturePage(page, 'menu-covers', { fullPage: false });
    await clearHighlights(page);
    await persons.getByRole('button', { name: '2', exact: true }).click();
    await page.getByTestId('menu-persons-ok').click();
    await page.waitForTimeout(400);
  }

  await expect(page.getByTestId('menu-page')).toBeVisible({ timeout: 30_000 });
  await waitForDishes(page);

  await highlightAndReady(page, [
    page.getByTestId('menu-header'),
    page.getByTestId('menu-order-types'),
  ]);
  await capturePage(page, 'menu-overview', { fullPage: false });
  await clearHighlights(page);

  const categories = page.getByTestId('menu-categories');
  await expect(categories).toBeVisible();
  await highlightAndReady(page, categories);
  await captureLocator(categories, 'menu-categories');
  await clearHighlights(page);

  const dishes = page.getByTestId('menu-dishes');
  await highlightAndReady(page, dishes);
  await captureLocator(dishes, 'menu-dishes');
  await clearHighlights(page);

  const dish = page.getByTestId('menu-dish').first();
  await highlightAndReady(page, dish);
  await captureLocator(dish, 'menu-dish-tile');
  await clearHighlights(page);
});
