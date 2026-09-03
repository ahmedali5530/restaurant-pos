import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openAccountsPage, resetSession } from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture accounts overview', async ({ page }) => {
  test.setTimeout(180_000);
  await resetSession(page);
  await loginWithPin(page);
  await openAccountsPage(page);
  await page.waitForTimeout(2_000);

  await highlightAndReady(page, page.getByTestId('accounts-page'));
  await capturePage(page, 'accounts-overview', { fullPage: false });
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('accounts-tabs'));
  await captureLocator(page.getByTestId('accounts-tabs'), 'accounts-tabs');
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('accounts-panel-chart-of-accounts'));
  await captureLocator(page.getByTestId('accounts-panel-chart-of-accounts'), 'accounts-chart');
  await clearHighlights(page);
});
