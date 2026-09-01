import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import {
  loginWithPin,
  openOrderDisplayPage,
  reloadAppCache,
  resetSession,
  sendOrderToKitchen,
} from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture order display', async ({ page }) => {
  test.setTimeout(360_000);
  await resetSession(page);
  await loginWithPin(page);
  await reloadAppCache(page);
  await sendOrderToKitchen(page);

  await openOrderDisplayPage(page);
  await page.waitForTimeout(2_000);

  await highlightAndReady(page, page.getByTestId('order-display-page'));
  await capturePage(page, 'order-display-overview', { fullPage: false });
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('order-display-filters'));
  await captureLocator(page.getByTestId('order-display-filters'), 'order-display-filters');
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('order-display-boards'));
  await captureLocator(page.getByTestId('order-display-boards'), 'order-display-boards');
  await clearHighlights(page);
});
