import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openHrPage, openHrTab, resetSession } from '../helpers/auth.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture hr attendance', async ({ page }) => {
  test.setTimeout(180_000);
  await resetSession(page);
  await loginWithPin(page);
  await openHrPage(page);
  await page.waitForTimeout(1_500);

  await openHrTab(page, 'attendance');
  await highlightAndReady(page, page.getByTestId('hr-page'));
  await capturePage(page, 'hr-attendance', { fullPage: false });
  await clearHighlights(page);

  await openHrTab(page, 'scheduling');
  await highlightAndReady(page, page.getByTestId('hr-page'));
  await capturePage(page, 'hr-scheduling', { fullPage: false });
  await clearHighlights(page);
});
