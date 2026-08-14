import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openHrPage, openHrTab, resetSession } from '../helpers/auth.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture hr leave', async ({ page }) => {
  test.setTimeout(180_000);
  await resetSession(page);
  await loginWithPin(page);
  await openHrPage(page);
  await page.waitForTimeout(1_500);

  await openHrTab(page, 'leave');
  await highlightAndReady(page, page.getByTestId('hr-page'));
  await capturePage(page, 'hr-leave', { fullPage: false });
  await clearHighlights(page);

  await openHrTab(page, 'holidays');
  await highlightAndReady(page, page.getByTestId('hr-page'));
  await capturePage(page, 'hr-holidays', { fullPage: false });
  await clearHighlights(page);
});
