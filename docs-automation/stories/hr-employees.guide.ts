import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openHrPage, openHrTab, resetSession } from '../helpers/auth.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture hr employees', async ({ page }) => {
  test.setTimeout(240_000);
  await resetSession(page);
  await loginWithPin(page);
  await openHrPage(page);
  await page.waitForTimeout(1_500);

  await openHrTab(page, 'employees');
  await highlightAndReady(page, page.getByTestId('hr-page'));
  await capturePage(page, 'hr-employees-list', { fullPage: false });
  await clearHighlights(page);

  await openHrTab(page, 'departments');
  await highlightAndReady(page, page.getByTestId('hr-page'));
  await capturePage(page, 'hr-employees-departments', { fullPage: false });
  await clearHighlights(page);

  await openHrTab(page, 'positions');
  await highlightAndReady(page, page.getByTestId('hr-page'));
  await capturePage(page, 'hr-employees-positions', { fullPage: false });
  await clearHighlights(page);
});
