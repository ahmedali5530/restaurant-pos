import { test, expect } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import {
  loginWithPin,
  openOrdersPage,
  reloadAppCache,
  resetSession,
  sendOrderToKitchen,
} from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture orders list, filters, and order card', async ({ page }) => {
  test.setTimeout(360_000);
  await resetSession(page);
  await loginWithPin(page);
  await reloadAppCache(page);

  // Ensure at least one open order for the card shot
  await sendOrderToKitchen(page);

  await openOrdersPage(page);
  await page.waitForTimeout(1_500);

  await highlightAndReady(page, page.getByTestId('orders-page'));
  await capturePage(page, 'orders-overview', { fullPage: false });
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('orders-filters'));
  await captureLocator(page.getByTestId('orders-filters'), 'orders-filters');
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('orders-toolbar'));
  await captureLocator(page.getByTestId('orders-toolbar'), 'orders-toolbar');
  await clearHighlights(page);

  const card = page.getByTestId('order-card').first();
  await expect(card, {
    message:
      'No order cards for docs. Send at least one order To kitchen, then re-run capture.',
  }).toBeVisible({ timeout: 45_000 });

  await highlightAndReady(page, card);
  await captureLocator(card, 'orders-card');
  await clearHighlights(page);

  await highlightAndReady(page, card.getByTestId('order-card-actions'));
  await captureLocator(card, 'orders-card-actions');
  await clearHighlights(page);

  // Open more menu for in-progress actions (cancel, split, merge…)
  await card.scrollIntoViewIfNeeded();
  const moreBtn = card.getByTestId('order-card-menu');
  await moreBtn.click({ force: true });
  await page.waitForTimeout(500);
  const menu = page.locator('[role="menu"]').last();
  if (await menu.isVisible().catch(() => false)) {
    await highlightAndReady(page, menu);
    await captureLocator(menu, 'orders-card-menu');
    await clearHighlights(page);
  } else {
    // Full viewport with open menu / card context if popover structure differs
    await highlightAndReady(page, card);
    await capturePage(page, 'orders-card-menu', { fullPage: false });
    await clearHighlights(page);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Table view (optional — capture if view actually switches)
  await page.getByTestId('orders-view-table').evaluate((el: HTMLElement) => el.click());
  await page.waitForTimeout(600);
  const tableList = page.getByTestId('orders-list-table');
  if (await tableList.isVisible().catch(() => false)) {
    await highlightAndReady(page, tableList);
    await captureLocator(tableList, 'orders-table-view');
    await clearHighlights(page);
    await page.getByTestId('orders-view-blocks').evaluate((el: HTMLElement) => el.click());
  } else {
    // Fallback: document blocks list as dense view context
    const blocks = page.getByTestId('orders-list-blocks');
    if (await blocks.isVisible().catch(() => false)) {
      await highlightAndReady(page, blocks);
      await captureLocator(blocks, 'orders-table-view');
      await clearHighlights(page);
    }
  }
});
