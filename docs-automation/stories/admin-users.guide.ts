import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openAdminPage, openAdminTab, openAdminUsersSubTab, resetSession } from '../helpers/auth.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture admin users', async ({ page }) => {
  test.setTimeout(180_000);
  await resetSession(page);
  await loginWithPin(page);
  await openAdminPage(page);
  await page.waitForTimeout(1_500);

  await openAdminTab(page, 'users');
  await openAdminUsersSubTab(page, 'users');
  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-users-list', { fullPage: false });
  await clearHighlights(page);

  await openAdminUsersSubTab(page, 'roles');
  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-users-roles', { fullPage: false });
  await clearHighlights(page);

  await openAdminUsersSubTab(page, 'shifts');
  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-users-shifts', { fullPage: false });
  await clearHighlights(page);

  await openAdminUsersSubTab(page, 'tips_definition');
  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-users-tips-definition', { fullPage: false });
  await clearHighlights(page);
});
