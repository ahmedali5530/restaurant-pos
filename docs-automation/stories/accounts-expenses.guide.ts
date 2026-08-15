import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openAccountsPage, openAccountsTab, resetSession } from '../helpers/auth.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture accounts journal entries', async ({ page }) => {
  test.setTimeout(180_000);
  await resetSession(page);
  await loginWithPin(page);
  await openAccountsPage(page);
  await page.waitForTimeout(1_500);

  await openAccountsTab(page, 'journal-entries');
  await highlightAndReady(page, page.getByTestId('accounts-page'));
  await capturePage(page, 'accounts-journal', { fullPage: false });
  await clearHighlights(page);

  await openAccountsTab(page, 'account-groups');
  await highlightAndReady(page, page.getByTestId('accounts-page'));
  await capturePage(page, 'accounts-groups', { fullPage: false });
  await clearHighlights(page);
});
