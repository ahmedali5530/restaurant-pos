import { test, expect, type Page } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import {
  docsLoginPin,
  loginWithPin,
  openPaymentScreen,
  reloadAppCache,
  resetSession,
} from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

async function dismissSecurityIfBlocking(page: Page): Promise<boolean> {
  // Another modal can appear when protectAction needs re-auth.
  const overlays = page.locator('.react-aria-ModalOverlay');
  const count = await overlays.count();
  if (count <= 1) return true; // payment modal only

  const top = overlays.last();
  const pinPad = top.locator('button', { hasText: /^[0-9]$/ });
  const hasPad = (await pinPad.count()) >= 4;
  if (hasPad) {
    const pin = docsLoginPin();
    for (const digit of pin.slice(0, 4)) {
      await top.getByRole('button', { name: digit, exact: true }).click();
    }
    // auto-submit or need enter
    const enter = top.getByRole('button', { name: /ok|enter|confirm/i });
    if (await enter.isVisible().catch(() => false)) {
      await enter.click();
    }
    await page.waitForTimeout(500);
    return true;
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  return false;
}

async function openTotalsRow(page: Page, rowTestId: string): Promise<boolean> {
  await page.getByTestId(rowTestId).click();
  await page.waitForTimeout(400);
  return dismissSecurityIfBlocking(page);
}

async function captureAdjustPanel(
  page: Page,
  rowTestId: string,
  panelTestId: string,
  imageName: string
): Promise<void> {
  const opened = await openTotalsRow(page, rowTestId);
  if (!opened) return;
  const panel = page.getByTestId(panelTestId);
  const visible = await panel.isVisible().catch(() => false);
  if (!visible) {
    // Fall back to middle column for environments where security blocked the mode switch
    const mid = page.getByTestId('payment-adjust-panel');
    if (!(await mid.isVisible().catch(() => false))) return;
    await highlightAndReady(page, mid);
    await captureLocator(mid, imageName);
    await clearHighlights(page);
    return;
  }
  await highlightAndReady(page, panel);
  await captureLocator(page.getByTestId('payment-adjust-panel'), imageName);
  await clearHighlights(page);
}

test('capture payment screen layout and tendering', async ({ page }) => {
  test.setTimeout(360_000);
  await resetSession(page);
  await loginWithPin(page);
  await reloadAppCache(page);
  await openPaymentScreen(page);

  const screen = page.getByTestId('payment-screen');
  await expect(screen).toBeVisible();

  await highlightAndReady(page, screen);
  await capturePage(page, 'payment-overview', { fullPage: false });
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('payment-order-summary'));
  await captureLocator(page.getByTestId('payment-order-summary'), 'payment-order-summary');
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('payment-totals'));
  await captureLocator(page.getByTestId('payment-totals'), 'payment-totals');
  await clearHighlights(page);

  // Adjust panels (tax/service/tip/discount require OK or Apply — do not rely on auto-apply)
  await captureAdjustPanel(page, 'payment-row-tax', 'payment-panel-tax', 'payment-adjust-tax');
  await captureAdjustPanel(page, 'payment-row-discount', 'payment-panel-discount', 'payment-adjust-discount');
  await captureAdjustPanel(page, 'payment-row-coupon', 'payment-panel-coupon', 'payment-adjust-coupon');
  await captureAdjustPanel(
    page,
    'payment-row-service-charges',
    'payment-panel-service-charges',
    'payment-adjust-service'
  );
  await captureAdjustPanel(page, 'payment-row-tip', 'payment-panel-tip', 'payment-adjust-tip');
  await captureAdjustPanel(page, 'payment-row-notes', 'payment-panel-notes', 'payment-adjust-notes');

  // Extras: no middle editor — toggle rows on the totals list when configured
  const extra = page.getByTestId('payment-row-extra').first();
  if (await extra.isVisible().catch(() => false)) {
    await highlightAndReady(page, page.getByTestId('payment-row-extra'));
    await captureLocator(page.getByTestId('payment-totals'), 'payment-extras');
    await clearHighlights(page);
  }

  await highlightAndReady(page, page.getByTestId('payment-receiving'));
  await captureLocator(page.getByTestId('payment-receiving'), 'payment-receiving');
  await clearHighlights(page);

  await highlightAndReady(page, [
    page.getByTestId('payment-tendered'),
    page.getByTestId('payment-change-due'),
  ]);
  await captureLocator(page.getByTestId('payment-tender-panel'), 'payment-tender-display');
  await clearHighlights(page);

  const paymentTypes = page.getByTestId('payment-types');
  await expect(paymentTypes.getByTestId('payment-type').first(), {
    message:
      'No payment types configured. Create Cash/Card payment types in Manage, reload cache, re-run capture.',
  }).toBeVisible({ timeout: 20_000 });
  await highlightAndReady(page, paymentTypes);
  await captureLocator(page.getByTestId('payment-tender-panel'), 'payment-types');
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('payment-keypad'));
  await captureLocator(page.getByTestId('payment-keypad'), 'payment-keypad');
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('payment-finish-actions'));
  await captureLocator(page.getByTestId('payment-finish-actions'), 'payment-finish-actions');
  await clearHighlights(page);

  // Tender remaining — do NOT complete order
  await page.getByTestId('payment-quick-exact').click();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('payment-line').first()).toBeVisible({ timeout: 10_000 });

  await highlightAndReady(page, page.getByTestId('payment-lines'));
  await captureLocator(page.getByTestId('payment-lines'), 'payment-lines');
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('payment-complete'));
  await captureLocator(page.getByTestId('payment-finish-actions'), 'payment-complete-ready');
  await clearHighlights(page);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
});
