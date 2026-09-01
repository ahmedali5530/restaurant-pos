import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openAccountsPage, openAccountsTab, resetSession } from '../helpers/auth.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture accounts ledgers and statements', async ({ page }) => {
  test.setTimeout(240_000);
  await resetSession(page);
  await loginWithPin(page);
  await openAccountsPage(page);
  await page.waitForTimeout(1_500);

  await openAccountsTab(page, 'general-ledger');
  await highlightAndReady(page, page.getByTestId('accounts-page'));
  await capturePage(page, 'accounts-ledger', { fullPage: false });
  await clearHighlights(page);

  await openAccountsTab(page, 'trial-balance');
  await highlightAndReady(page, page.getByTestId('accounts-page'));
  await capturePage(page, 'accounts-trial-balance', { fullPage: false });
  await clearHighlights(page);

  await openAccountsTab(page, 'balance-sheet');
  await highlightAndReady(page, page.getByTestId('accounts-page'));
  await capturePage(page, 'accounts-balance-sheet', { fullPage: false });
  await clearHighlights(page);

  await openAccountsTab(page, 'profit-loss');
  await highlightAndReady(page, page.getByTestId('accounts-page'));
  await capturePage(page, 'accounts-profit-loss', { fullPage: false });
  await clearHighlights(page);

  await openAccountsTab(page, 'cash-flow');
  await highlightAndReady(page, page.getByTestId('accounts-page'));
  await capturePage(page, 'accounts-cash-flow', { fullPage: false });
  await clearHighlights(page);
});
