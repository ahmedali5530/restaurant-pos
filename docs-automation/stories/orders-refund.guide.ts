import { test, expect } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import {
  clickOrderMenuAction,
  closeAllModals,
  dismissSecurityModal,
  loginWithPin,
  openOrderCardMenu,
  openOrdersPage,
  reloadAppCache,
  resetSession,
  sendOrderToKitchen,
} from '../helpers/auth.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture order refund modal', async ({ page }) => {
  test.setTimeout(300_000);
  await resetSession(page);
  await loginWithPin(page);
  await reloadAppCache(page);
  await openOrdersPage(page);
  await page.waitForTimeout(1_000);

  async function tryOpenRefund(): Promise<boolean> {
    const cardCount = Math.min(await page.getByTestId('order-card').count(), 12);
    for (let i = 0; i < cardCount; i++) {
      await openOrderCardMenu(page, i);
      const refundItem = page.getByTestId('order-menu-refund');
      if (await refundItem.isVisible().catch(() => false)) {
        await clickOrderMenuAction(page, 'refund');
        return true;
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
    return false;
  }

  let opened = await tryOpenRefund();

  // Pay an In Progress check from the card Pay button (avoids floor plan)
  if (!opened) {
    if ((await page.getByTestId('order-card').count()) === 0) {
      await sendOrderToKitchen(page);
      await openOrdersPage(page);
      await page.waitForTimeout(1_000);
    }
    const payBtn = page.getByTestId('order-card-pay').first();
    await expect(payBtn).toBeVisible({ timeout: 30_000 });
    await payBtn.click();
    await expect(page.getByTestId('payment-screen')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('payment-quick-exact').click();
    await page.waitForTimeout(400);
    await page.getByTestId('payment-complete').click();
    await page.waitForTimeout(800);
    await dismissSecurityModal(page);
    await page.waitForTimeout(1_500);
    await closeAllModals(page);
    await openOrdersPage(page);
    await page.waitForTimeout(1_000);
    opened = await tryOpenRefund();
  }

  const refundModal = page.getByTestId('order-refund-modal');
  await expect(refundModal).toBeVisible({ timeout: 30_000 });
  await highlightAndReady(page, refundModal);
  await capturePage(page, 'orders-refund-modal', { fullPage: false });
  await clearHighlights(page);
});
