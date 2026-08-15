import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openInventoryPage, openInventoryTab, resetSession } from '../helpers/auth.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture inventory wastes', async ({ page }) => {
  test.setTimeout(180_000);
  await resetSession(page);
  await loginWithPin(page);
  await openInventoryPage(page);
  await page.waitForTimeout(1_500);

  await openInventoryTab(page, 'wastes');
  await highlightAndReady(page, page.getByTestId('inventory-page'));
  await capturePage(page, 'inventory-wastes-list', { fullPage: false });
  await clearHighlights(page);
});
