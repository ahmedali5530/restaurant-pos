import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openHrPage, resetSession } from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture hr overview', async ({ page }) => {
  test.setTimeout(180_000);
  await resetSession(page);
  await loginWithPin(page);
  await openHrPage(page);
  await page.waitForTimeout(2_000);

  await highlightAndReady(page, page.getByTestId('hr-page'));
  await capturePage(page, 'hr-overview', { fullPage: false });
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('hr-tabs'));
  await captureLocator(page.getByTestId('hr-tabs'), 'hr-tabs');
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('hr-panel-dashboard'));
  await captureLocator(page.getByTestId('hr-panel-dashboard'), 'hr-dashboard');
  await clearHighlights(page);
});
