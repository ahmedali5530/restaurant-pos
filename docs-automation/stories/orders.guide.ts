import { test, expect } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import {
  clickOrderMenuAction,
  closeAllModals,
  loginWithPin,
  openOrderCardMenu,
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

  await openOrdersPage(page);
  await page.waitForTimeout(1_000);
  if ((await page.getByTestId('order-card').count()) === 0) {
    await sendOrderToKitchen(page);
    await openOrdersPage(page);
    await page.waitForTimeout(1_500);
  }

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
  await expect(card).toBeVisible({ timeout: 45_000 });

  await highlightAndReady(page, card);
  await captureLocator(card, 'orders-card');
  await clearHighlights(page);

  await highlightAndReady(page, card.getByTestId('order-card-actions'));
  await captureLocator(card, 'orders-card-actions');
  await clearHighlights(page);

  await openOrderCardMenu(page);
  const menu = page.locator('[role="menu"]').last();
  if (await menu.isVisible().catch(() => false)) {
    await highlightAndReady(page, menu);
    await captureLocator(menu, 'orders-card-menu');
    await clearHighlights(page);
  }
  await page.keyboard.press('Escape');
  await closeAllModals(page);
  await page.waitForTimeout(300);

  // Cancel / void modal
  await openOrderCardMenu(page);
  await clickOrderMenuAction(page, 'cancel');
  const cancelModal = page.getByTestId('order-cancel-modal');
  if (await cancelModal.isVisible().catch(() => false)) {
    await highlightAndReady(page, cancelModal);
    await capturePage(page, 'orders-cancel-modal', { fullPage: false });
    await clearHighlights(page);
    await closeAllModals(page);
  }

  // Split modals (seats often disabled when items have no seat numbers)
  for (const [action, shot, testId] of [
    ['split_by_items', 'orders-split-items', 'order-split-items'],
    ['split_by_amount', 'orders-split-amount', 'order-split-amount'],
    ['split_by_seats', 'orders-split-seats', 'order-split-seats'],
  ] as const) {
    await openOrderCardMenu(page);
    const menuItem = page.getByTestId(`order-menu-${action}`);
    if ((await menuItem.getAttribute('aria-disabled')) === 'true' || await menuItem.isDisabled().catch(() => false)) {
      await page.keyboard.press('Escape');
      continue;
    }
    await clickOrderMenuAction(page, action);
    const modal = page.getByTestId(testId);
    if (await modal.isVisible().catch(() => false)) {
      await highlightAndReady(page, modal);
      await capturePage(page, shot, { fullPage: false });
      await clearHighlights(page);
      await closeAllModals(page);
    } else {
      await closeAllModals(page);
    }
  }

  // Merge mode
  await openOrderCardMenu(page);
  await clickOrderMenuAction(page, 'merge');
  const mergeBar = page.getByTestId('orders-merge-bar');
  await expect(mergeBar).toBeVisible({ timeout: 15_000 });
  await highlightAndReady(page, mergeBar);
  await capturePage(page, 'orders-merge-bar', { fullPage: false });
  await clearHighlights(page);
  await mergeBar.getByTestId('orders-merge-cancel').click();
  await page.waitForTimeout(400);

  // Table view
  await page.getByTestId('orders-view-table').evaluate((el: HTMLElement) => el.click());
  await page.waitForTimeout(600);
  const tableList = page.getByTestId('orders-list-table');
  if (await tableList.isVisible().catch(() => false)) {
    await highlightAndReady(page, tableList);
    await captureLocator(tableList, 'orders-table-view');
    await clearHighlights(page);
  }
});
