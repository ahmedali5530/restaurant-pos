import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openTipDistributionPage, resetSession } from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture tip distribution', async ({ page }) => {
  test.setTimeout(180_000);
  await resetSession(page);
  await loginWithPin(page);
  await openTipDistributionPage(page);
  await page.waitForTimeout(1_000);

  await highlightAndReady(page, page.getByTestId('tip-distribution-page'));
  await capturePage(page, 'tips-overview', { fullPage: false });
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('tip-distribution-filters'));
  await captureLocator(page.getByTestId('tip-distribution-filters'), 'tips-filters');
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('tip-distribution-table'));
  await captureLocator(page.getByTestId('tip-distribution-table'), 'tips-table');
  await clearHighlights(page);
});
