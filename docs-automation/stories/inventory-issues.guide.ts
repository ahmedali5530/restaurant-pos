import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openInventoryPage, openInventoryTab, resetSession } from '../helpers/auth.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture inventory issues and returns', async ({ page }) => {
  test.setTimeout(240_000);
  await resetSession(page);
  await loginWithPin(page);
  await openInventoryPage(page);
  await page.waitForTimeout(1_500);

  await openInventoryTab(page, 'issues');
  await highlightAndReady(page, page.getByTestId('inventory-page'));
  await capturePage(page, 'inventory-issues-list', { fullPage: false });
  await clearHighlights(page);

  await openInventoryTab(page, 'issue-returns');
  await highlightAndReady(page, page.getByTestId('inventory-page'));
  await capturePage(page, 'inventory-issues-returns', { fullPage: false });
  await clearHighlights(page);
});
