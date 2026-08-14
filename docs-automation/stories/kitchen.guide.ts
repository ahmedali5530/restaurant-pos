import { test, expect } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import {
  loginWithPin,
  openKitchenPage,
  reloadAppCache,
  resetSession,
  sendOrderToKitchen,
} from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture kitchen board', async ({ page }) => {
  test.setTimeout(360_000);
  await resetSession(page);
  await loginWithPin(page);
  await reloadAppCache(page);
  await sendOrderToKitchen(page);

  await openKitchenPage(page);
  await page.waitForTimeout(2_500);

  await highlightAndReady(page, page.getByTestId('kitchen-page'));
  await capturePage(page, 'kitchen-overview', { fullPage: false });
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('kitchen-toolbar'));
  await captureLocator(page.getByTestId('kitchen-toolbar'), 'kitchen-toolbar');
  await clearHighlights(page);

  const board = page.getByTestId('kitchen-board');
  await board.scrollIntoViewIfNeeded();
  await highlightAndReady(page, board);
  await captureLocator(board, 'kitchen-board');
  await clearHighlights(page);
});
