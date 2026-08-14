import { test, expect } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import {
  ensureFloorMenuMode,
  loginWithPin,
  reloadAppCache,
  resetSession,
  waitForDishes,
} from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture tables and dine-in deep dive', async ({ page }) => {
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
    message: 'Floor tables required — seed floors/tables then reload cache.',
  }).toBeVisible({ timeout: 45_000 });

  await highlightAndReady(page, page.getByTestId('menu-floor'));
  await capturePage(page, 'tables-floor', { fullPage: false });
  await clearHighlights(page);

  const switcher = page.getByTestId('menu-floor-switcher');
  if (await switcher.isVisible().catch(() => false)) {
    await highlightAndReady(page, switcher);
    await captureLocator(switcher, 'tables-floor-switcher');
    await clearHighlights(page);
  }

  await highlightAndReady(page, table);
  await captureLocator(table, 'tables-table-tile');
  await clearHighlights(page);

  await table.click({ force: true });
  await page.waitForTimeout(600);

  // If table asks for covers on select, capture now; otherwise open covers from menu header
  let persons = page.getByTestId('menu-persons-screen');
  if (await persons.isVisible().catch(() => false)) {
    await highlightAndReady(page, persons);
    await capturePage(page, 'tables-covers', { fullPage: false });
    await clearHighlights(page);
    await persons.getByRole('button', { name: '2', exact: true }).click();
    await page.getByTestId('menu-persons-ok').click();
    await page.waitForTimeout(400);
  }

  await expect(page.getByTestId('menu-page')).toBeVisible({ timeout: 30_000 });
  await waitForDishes(page);

  // Open covers from header when table did not ask on select
  if (!(await page.getByTestId('menu-persons-screen').isVisible().catch(() => false))) {
    const personsBtn = page.getByTestId('menu-persons');
    if (await personsBtn.isVisible().catch(() => false)) {
      await personsBtn.click();
      await page.waitForTimeout(500);
      persons = page.getByTestId('menu-persons-screen');
      await expect(persons).toBeVisible({ timeout: 15_000 });
      await highlightAndReady(page, persons);
      await capturePage(page, 'tables-covers', { fullPage: false });
      await clearHighlights(page);
      await persons.getByRole('button', { name: '2', exact: true }).click();
      await page.getByTestId('menu-persons-ok').click();
      await page.waitForTimeout(400);
      await expect(page.getByTestId('menu-page')).toBeVisible({ timeout: 15_000 });
    }
  }

  const tableChip = page.getByTestId('menu-table');
  if (await tableChip.isVisible().catch(() => false)) {
    await highlightAndReady(page, tableChip);
    await captureLocator(tableChip, 'tables-active-table');
    await clearHighlights(page);
  }

  const back = page.getByTestId('menu-back-floor');
  if (await back.isVisible().catch(() => false)) {
    await highlightAndReady(page, back);
    await captureLocator(back, 'tables-back-floor');
    await clearHighlights(page);
  }
});
