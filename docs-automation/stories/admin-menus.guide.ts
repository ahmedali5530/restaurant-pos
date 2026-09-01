import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openAdminPage, openAdminTab, resetSession } from '../helpers/auth.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture admin menus tabs', async ({ page }) => {
  test.setTimeout(240_000);
  await resetSession(page);
  await loginWithPin(page);
  await openAdminPage(page);
  await page.waitForTimeout(1_500);

  await openAdminTab(page, 'dishes');
  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-menus-dishes', { fullPage: false });
  await clearHighlights(page);

  await openAdminTab(page, 'menus');
  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-menus-menus', { fullPage: false });
  await clearHighlights(page);

  await openAdminTab(page, 'categories');
  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-menus-categories', { fullPage: false });
  await clearHighlights(page);

  await openAdminTab(page, 'modifier_groups');
  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-modifier-groups', { fullPage: false });
  await clearHighlights(page);
});
