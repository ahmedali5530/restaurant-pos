import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openAdminPage, resetSession } from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture admin manage overview', async ({ page }) => {
  test.setTimeout(180_000);
  await resetSession(page);
  await loginWithPin(page);
  await openAdminPage(page);
  await page.waitForTimeout(2_000);

  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-overview', { fullPage: false });
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('admin-tabs'));
  await captureLocator(page.getByTestId('admin-tabs'), 'admin-tabs');
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('admin-panel-dishes'));
  await captureLocator(page.getByTestId('admin-panel-dishes'), 'admin-dishes');
  await clearHighlights(page);
});
