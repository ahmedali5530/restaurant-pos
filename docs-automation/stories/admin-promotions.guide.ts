import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import {
  loginWithPin,
  openAdminDiscountsSubTab,
  openAdminPage,
  openAdminTab,
  resetSession,
} from '../helpers/auth.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture admin discounts and coupons', async ({ page }) => {
  test.setTimeout(300_000);
  await resetSession(page);
  await loginWithPin(page);
  await openAdminPage(page);
  await page.waitForTimeout(1_500);

  await openAdminTab(page, 'discounts');
  await openAdminDiscountsSubTab(page, 'rules');
  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-discounts-rules', { fullPage: false });
  await clearHighlights(page);

  await openAdminDiscountsSubTab(page, 'reasons');
  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-discounts-reasons', { fullPage: false });
  await clearHighlights(page);

  await openAdminDiscountsSubTab(page, 'permissions');
  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-discounts-permissions', { fullPage: false });
  await clearHighlights(page);

  await openAdminTab(page, 'coupons');
  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-coupons', { fullPage: false });
  await clearHighlights(page);
});
