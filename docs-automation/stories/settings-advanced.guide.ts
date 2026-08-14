import { test, expect } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openSettings, resetSession } from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

/** Advanced / venue-ops Settings cards for Administrator guide. */
const ADVANCED_CARDS: Array<{ testId: string; file: string }> = [
  { testId: 'settings-card-closing-cycle', file: 'settings-adv-closing-cycle' },
  { testId: 'settings-card-auto-check-close', file: 'settings-adv-auto-check-close' },
  { testId: 'settings-card-session-security', file: 'settings-adv-session-security' },
  { testId: 'settings-card-auto-clock-out', file: 'settings-adv-auto-clock-out' },
  { testId: 'settings-card-service-charges', file: 'settings-adv-service-charges' },
  { testId: 'settings-card-menus', file: 'settings-adv-menus' },
  { testId: 'settings-card-inventory', file: 'settings-adv-inventory' },
  { testId: 'settings-card-printers', file: 'settings-adv-printers' },
];

test('capture advanced device settings', async ({ page }) => {
  test.setTimeout(300_000);
  await resetSession(page);
  await loginWithPin(page);
  await openSettings(page);
  await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 30_000 });

  await highlightAndReady(page, page.getByTestId('settings-page'));
  await capturePage(page, 'settings-adv-overview', { fullPage: true });
  await clearHighlights(page);

  for (const { testId, file } of ADVANCED_CARDS) {
    const card = page.getByTestId(testId);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await highlightAndReady(page, card);
    await captureLocator(card, file);
    await clearHighlights(page);
  }
});
