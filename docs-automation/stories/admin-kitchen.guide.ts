import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openAdminPage, openAdminTab, resetSession } from '../helpers/auth.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture admin kitchens and workflows', async ({ page }) => {
  test.setTimeout(240_000);
  await resetSession(page);
  await loginWithPin(page);
  await openAdminPage(page);
  await page.waitForTimeout(1_500);

  await openAdminTab(page, 'kitchens');
  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-kitchens', { fullPage: false });
  await clearHighlights(page);

  await openAdminTab(page, 'workflows');
  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-workflows', { fullPage: false });
  await clearHighlights(page);
});
