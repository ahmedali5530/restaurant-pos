import { test, expect } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import {
  addFirstPlainDish,
  loginWithPin,
  openMenuOrdering,
  reloadAppCache,
  resetSession,
  waitForDishes,
} from '../helpers/auth.ts';
import { captureLocator } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture cart with a real line item', async ({ page }) => {
  test.setTimeout(300_000);
  await resetSession(page);
  await loginWithPin(page);
  await reloadAppCache(page);
  await openMenuOrdering(page);
  await waitForDishes(page);
  await addFirstPlainDish(page);

  const cart = page.getByTestId('cart-panel');
  await expect(cart).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('cart-pay-now')).toBeEnabled({ timeout: 15_000 });

  await highlightAndReady(page, page.getByTestId('cart-payment-actions'));
  await captureLocator(page.getByTestId('menu-cart'), 'cart-panel');
  await clearHighlights(page);

  await highlightAndReady(page, [
    page.getByTestId('cart-to-kitchen'),
    page.getByTestId('cart-pay-now'),
    page.getByTestId('cart-cancel'),
  ]);
  await captureLocator(page.getByTestId('cart-payment-actions'), 'cart-payment-actions');
  await clearHighlights(page);
});
