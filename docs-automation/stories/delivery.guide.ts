import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openDeliveryPage, resetSession } from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture delivery tabs', async ({ page }) => {
  test.setTimeout(240_000);
  await resetSession(page);
  await loginWithPin(page);
  await openDeliveryPage(page);
  await page.waitForTimeout(3_000);

  await highlightAndReady(page, page.getByTestId('delivery-page'));
  await capturePage(page, 'delivery-overview', { fullPage: false });
  await clearHighlights(page);

  const mapPanel = page.getByTestId('delivery-map-panel');
  if (await mapPanel.isVisible().catch(() => false)) {
    await highlightAndReady(page, mapPanel);
    await captureLocator(mapPanel, 'delivery-map');
    await clearHighlights(page);
  }

  // Use stable tab testids (labels are localized)
  await page.getByTestId('delivery-tab-areas').click();
  await page.waitForTimeout(1_500);
  await highlightAndReady(page, page.getByTestId('delivery-page'));
  await capturePage(page, 'delivery-areas', { fullPage: false });
  await clearHighlights(page);

  await page.getByTestId('delivery-tab-settings').click();
  await page.waitForTimeout(1_000);
  await highlightAndReady(page, page.getByTestId('delivery-page'));
  await capturePage(page, 'delivery-settings', { fullPage: false });
  await clearHighlights(page);
});
