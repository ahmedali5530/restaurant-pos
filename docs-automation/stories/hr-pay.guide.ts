import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openHrPage, openHrTab, resetSession } from '../helpers/auth.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture hr pay profiles and rules', async ({ page }) => {
  test.setTimeout(180_000);
  await resetSession(page);
  await loginWithPin(page);
  await openHrPage(page);
  await page.waitForTimeout(1_500);

  await openHrTab(page, 'pay-profiles');
  await highlightAndReady(page, page.getByTestId('hr-page'));
  await capturePage(page, 'hr-pay-profiles', { fullPage: false });
  await clearHighlights(page);

  await openHrTab(page, 'pay-rules');
  await highlightAndReady(page, page.getByTestId('hr-page'));
  await capturePage(page, 'hr-pay-rules', { fullPage: false });
  await clearHighlights(page);
});
