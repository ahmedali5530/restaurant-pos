import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openAdminPage, openAdminTab, resetSession } from '../helpers/auth.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture admin payment types and taxes', async ({ page }) => {
  test.setTimeout(240_000);
  await resetSession(page);
  await loginWithPin(page);
  await openAdminPage(page);
  await page.waitForTimeout(1_500);

  await openAdminTab(page, 'payment_types');
  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-payments-types', { fullPage: false });
  await clearHighlights(page);

  await openAdminTab(page, 'taxes');
  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-payments-taxes', { fullPage: false });
  await clearHighlights(page);

  await openAdminTab(page, 'order_types');
  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-payments-order-types', { fullPage: false });
  await clearHighlights(page);

  await openAdminTab(page, 'extras');
  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-extras', { fullPage: false });
  await clearHighlights(page);
});
