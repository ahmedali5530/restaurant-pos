import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openClosingPage, resetSession } from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture closing screen', async ({ page }) => {
  test.setTimeout(240_000);
  await resetSession(page);
  await loginWithPin(page);
  await openClosingPage(page);
  await page.waitForTimeout(2_000);

  await highlightAndReady(page, page.getByTestId('closing-page'));
  await capturePage(page, 'closing-overview', { fullPage: false });
  await clearHighlights(page);

  const terminal = page.getByTestId('closing-terminal-cash-section');
  await terminal.scrollIntoViewIfNeeded();
  await highlightAndReady(page, terminal);
  await captureLocator(terminal, 'closing-terminal-cash');
  await clearHighlights(page);

  const expenses = page.getByTestId('closing-expenses-section');
  await expenses.scrollIntoViewIfNeeded();
  await highlightAndReady(page, expenses);
  await captureLocator(expenses, 'closing-payments');
  await clearHighlights(page);

  const actions = page.getByTestId('closing-actions');
  await actions.scrollIntoViewIfNeeded();
  await highlightAndReady(page, actions);
  await captureLocator(actions, 'closing-actions');
  await clearHighlights(page);
});
