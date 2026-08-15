import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openInventoryPage, openInventoryTab, resetSession } from '../helpers/auth.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture inventory items and locations', async ({ page }) => {
  test.setTimeout(240_000);
  await resetSession(page);
  await loginWithPin(page);
  await openInventoryPage(page);
  await page.waitForTimeout(1_500);

  await openInventoryTab(page, 'items');
  await highlightAndReady(page, page.getByTestId('inventory-page'));
  await capturePage(page, 'inventory-items-list', { fullPage: false });
  await clearHighlights(page);

  await openInventoryTab(page, 'categories');
  await highlightAndReady(page, page.getByTestId('inventory-page'));
  await capturePage(page, 'inventory-items-categories', { fullPage: false });
  await clearHighlights(page);

  await openInventoryTab(page, 'locations');
  await highlightAndReady(page, page.getByTestId('inventory-page'));
  await capturePage(page, 'inventory-items-locations', { fullPage: false });
  await clearHighlights(page);
});
