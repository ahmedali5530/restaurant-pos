import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openInventoryPage, resetSession } from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture inventory overview', async ({ page }) => {
  test.setTimeout(180_000);
  await resetSession(page);
  await loginWithPin(page);
  await openInventoryPage(page);
  await page.waitForTimeout(2_000);

  await highlightAndReady(page, page.getByTestId('inventory-page'));
  await capturePage(page, 'inventory-overview', { fullPage: false });
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('inventory-tabs'));
  await captureLocator(page.getByTestId('inventory-tabs'), 'inventory-tabs');
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('inventory-panel-inventory'));
  await captureLocator(page.getByTestId('inventory-panel-inventory'), 'inventory-summary');
  await clearHighlights(page);
});
