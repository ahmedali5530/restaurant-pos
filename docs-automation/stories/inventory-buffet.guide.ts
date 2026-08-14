import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openInventoryPage, openInventoryTab, resetSession, closeAllModals } from '../helpers/auth.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture inventory buffet menus and sessions', async ({ page }) => {
  test.setTimeout(240_000);
  await resetSession(page);
  await loginWithPin(page);
  await openInventoryPage(page);
  await page.waitForTimeout(1_500);

  await openInventoryTab(page, 'buffet-menus');
  await highlightAndReady(page, page.getByTestId('inventory-page'));
  await capturePage(page, 'inventory-buffet-menus', { fullPage: false });
  await clearHighlights(page);
  await page.getByTestId('inventory-add-buffet-menus').click();
  await page.waitForTimeout(600);
  await highlightAndReady(page, page.getByTestId('inventory-page'));
  await capturePage(page, 'inventory-buffet-menu-form', { fullPage: false });
  await clearHighlights(page);
  await closeAllModals(page);

  await openInventoryTab(page, 'buffet-sessions');
  await highlightAndReady(page, page.getByTestId('inventory-page'));
  await capturePage(page, 'inventory-buffet-sessions', { fullPage: false });
  await clearHighlights(page);
  await page.getByTestId('inventory-add-buffet-sessions').click();
  await page.waitForTimeout(600);
  await highlightAndReady(page, page.getByTestId('inventory-page'));
  await capturePage(page, 'inventory-buffet-session-form', { fullPage: false });
  await clearHighlights(page);
});
