import { test, expect } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import {
  loginWithPin,
  openSettings,
  resetSession,
} from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture lock, locked login, and clock screen', async ({ page }) => {
  test.setTimeout(360_000);
  await resetSession(page);
  await loginWithPin(page);

  // Sidebar session controls
  await expect(page.getByTestId('nav-lock')).toBeVisible({ timeout: 30_000 });
  await highlightAndReady(page, [
    page.getByTestId('nav-settings'),
    page.getByTestId('nav-clock'),
    page.getByTestId('nav-lock'),
    page.getByTestId('nav-logout'),
  ]);
  await capturePage(page, 'session-sidebar-controls', { fullPage: false });
  await clearHighlights(page);

  // Clock (needs active time entry from login clock-in when required)
  await page.getByTestId('nav-clock').click();
  await page.waitForTimeout(1_500);
  if (await page.getByTestId('clock-page').isVisible().catch(() => false)) {
    await capturePage(page, 'session-clock', { fullPage: false });

    if (await page.getByTestId('clock-session').isVisible().catch(() => false)) {
      await highlightAndReady(page, page.getByTestId('clock-session'));
      await captureLocator(page.getByTestId('clock-session'), 'session-clock-detail');
      await clearHighlights(page);
    }
    if (await page.getByTestId('clock-sale-summary').isVisible().catch(() => false)) {
      await highlightAndReady(page, page.getByTestId('clock-sale-summary'));
      await captureLocator(page.getByTestId('clock-sale-summary'), 'session-clock-sales');
      await clearHighlights(page);
    }
  } else {
    // No open time entry: capture login toast/redirect state briefly
    await capturePage(page, 'session-clock', { fullPage: false });
  }

  // Ensure we are logged in before lock shot
  if (await page.getByTestId('login-page').isVisible().catch(() => false)) {
    await loginWithPin(page);
  }

  await page.goto('/menu').catch(() => undefined);
  await page.waitForTimeout(800);
  if (!(await page.getByTestId('nav-lock').isVisible().catch(() => false))) {
    await loginWithPin(page);
  }

  await page.getByTestId('nav-lock').click();
  await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('login-locked-banner')).toBeVisible({ timeout: 15_000 });
  await highlightAndReady(page, page.getByTestId('login-locked-banner'));
  await capturePage(page, 'session-locked', { fullPage: false });
  await clearHighlights(page);

  // Unlock with same PIN (loginWithPin works while locked for same user)
  await page.getByTestId('login-method-pin').click();
  const pin = process.env.DOCS_LOGIN_PIN || '5555';
  for (const digit of pin.slice(0, 4)) {
    await page.getByTestId('login-pin-pad').getByRole('button', { name: digit, exact: true }).click();
  }
  await page.waitForURL(/\/(menu|settings|orders|admin|clock)/, { timeout: 60_000 });

  // Session security settings (idle lock/logout) — reference already exists; re-link as session chapter image
  await openSettings(page);
  const card = page.getByTestId('settings-card-session-security');
  await expect(card).toBeVisible();
  await highlightAndReady(page, card);
  await captureLocator(card, 'session-idle-settings');
  await clearHighlights(page);
});
