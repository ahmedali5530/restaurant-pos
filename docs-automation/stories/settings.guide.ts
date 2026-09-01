import { test, expect } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openSettings, resetSession } from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

/** All Settings page cards (matches Settings masonry layout + existing coverage). */
const SETTINGS_CARDS: Array<{ testId: string; file: string }> = [
  { testId: 'settings-card-whats-new', file: 'settings-whats-new' },
  { testId: 'settings-card-cache', file: 'settings-cache' },
  { testId: 'settings-card-language', file: 'settings-language' },
  { testId: 'settings-card-translate-receipts', file: 'settings-translate-receipts' },
  { testId: 'settings-card-printers', file: 'settings-printers' },
  { testId: 'settings-card-print-options', file: 'settings-print-options' },
  { testId: 'settings-card-menus', file: 'settings-menus' },
  { testId: 'settings-card-service-charges', file: 'settings-service-charges' },
  { testId: 'settings-card-closing-cycle', file: 'settings-closing-cycle' },
  { testId: 'settings-card-auto-check-close', file: 'settings-auto-check-close' },
  { testId: 'settings-card-session-security', file: 'settings-session-security' },
  { testId: 'settings-card-auto-clock-out', file: 'settings-auto-clock-out' },
  { testId: 'settings-card-show-inclusive-prices', file: 'settings-show-inclusive-prices' },
  { testId: 'settings-card-currency-symbol', file: 'settings-currency-symbol' },
  { testId: 'settings-card-touch', file: 'settings-touch' },
  { testId: 'settings-card-table-selection', file: 'settings-table-selection' },
  { testId: 'settings-card-inventory', file: 'settings-inventory' },
  { testId: 'settings-card-items-visibility', file: 'settings-items-visibility' },
];

test('capture settings navigation', async ({ page }) => {
  test.setTimeout(180_000);
  await resetSession(page);
  await loginWithPin(page);
  await expect(page.getByTestId('nav-settings')).toBeVisible({ timeout: 30_000 });

  await highlightAndReady(page, page.getByTestId('nav-settings'));
  await capturePage(page, 'settings-nav', { fullPage: false });
  await clearHighlights(page);
});

test('capture settings overview and cards', async ({ page }) => {
  test.setTimeout(360_000);
  await resetSession(page);
  await loginWithPin(page);
  await openSettings(page);
  await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 30_000 });

  await clearHighlights(page);
  await capturePage(page, 'settings-overview', { fullPage: true });

  for (const { testId, file } of SETTINGS_CARDS) {
    const card = page.getByTestId(testId);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await highlightAndReady(page, card);
    await captureLocator(card, file);
    await clearHighlights(page);
  }
});
