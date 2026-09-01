import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { closeAllModals, loginWithPin, openInventoryPage, openInventoryTab, resetSession } from '../helpers/auth.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture inventory kitchen reconciliation', async ({ page }) => {
  test.setTimeout(240_000);
  await resetSession(page);
  await loginWithPin(page);
  await openInventoryPage(page);
  await page.waitForTimeout(1_500);

  await openInventoryTab(page, 'kitchen-reconciliation');
  await highlightAndReady(page, page.getByTestId('inventory-page'));
  await capturePage(page, 'inventory-reconciliation-overview', { fullPage: false });
  await clearHighlights(page);

  const add = page.getByTestId('inventory-add-reconciliation');
  if (await add.isEnabled().catch(() => false)) {
    await add.click();
    await page.waitForTimeout(600);
  }
  await highlightAndReady(page, page.getByTestId('inventory-page'));
  await capturePage(page, 'inventory-reconciliation-form', { fullPage: false });
  await clearHighlights(page);
  await closeAllModals(page);
});
