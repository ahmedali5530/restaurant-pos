import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openInventoryPage, openInventoryTab, resetSession, closeAllModals } from '../helpers/auth.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture inventory production and recipes', async ({ page }) => {
  test.setTimeout(300_000);
  await resetSession(page);
  await loginWithPin(page);
  await openInventoryPage(page);
  await page.waitForTimeout(1_500);

  await openInventoryTab(page, 'recipes');
  await highlightAndReady(page, page.getByTestId('inventory-page'));
  await capturePage(page, 'inventory-recipes', { fullPage: false });
  await clearHighlights(page);
  await page.getByTestId('inventory-add-recipes').click();
  await page.waitForTimeout(600);
  await highlightAndReady(page, page.getByTestId('inventory-page'));
  await capturePage(page, 'inventory-recipe-form', { fullPage: false });
  await clearHighlights(page);
  await closeAllModals(page);

  await openInventoryTab(page, 'production');
  await highlightAndReady(page, page.getByTestId('inventory-page'));
  await capturePage(page, 'inventory-production', { fullPage: false });
  await clearHighlights(page);
  await page.getByTestId('inventory-add-production').click();
  await page.waitForTimeout(600);
  await highlightAndReady(page, page.getByTestId('inventory-page'));
  await capturePage(page, 'inventory-production-form', { fullPage: false });
  await clearHighlights(page);
  await closeAllModals(page);

  await openInventoryTab(page, 'production-history');
  await highlightAndReady(page, page.getByTestId('inventory-page'));
  await capturePage(page, 'inventory-production-history', { fullPage: false });
  await clearHighlights(page);
});
