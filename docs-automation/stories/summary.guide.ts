import { test, expect } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openSummaryPage, resetSession } from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture summary screen', async ({ page }) => {
  test.setTimeout(180_000);
  await resetSession(page);
  await loginWithPin(page);
  await openSummaryPage(page);
  await page.waitForTimeout(2_000);

  await highlightAndReady(page, page.getByTestId('summary-page'));
  await capturePage(page, 'summary-overview', { fullPage: false });
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('summary-calendar'));
  await captureLocator(page.getByTestId('summary-calendar'), 'summary-calendar');
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('summary-print-actions'));
  await captureLocator(page.getByTestId('summary-print-actions'), 'summary-print-actions');
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('summary-report'));
  await captureLocator(page.getByTestId('summary-report'), 'summary-report');
  await clearHighlights(page);
});
