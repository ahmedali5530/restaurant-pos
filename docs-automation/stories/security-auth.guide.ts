import { test, expect } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openSettings, resetSession } from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture security re-authentication', async ({ page }) => {
  test.setTimeout(180_000);
  await resetSession(page);
  await loginWithPin(page);
  await openSettings(page);

  // Context for when re-auth appears (settings / protected actions)
  await highlightAndReady(page, page.getByTestId('settings-card-session-security'));
  await captureLocator(page.getByTestId('settings-card-session-security'), 'security-session-card');
  await clearHighlights(page);

  await page.evaluate(() => {
    const api = (window as Window & {
      __POSR_DOCS_SECURITY__?: { open: (description?: string) => void };
    }).__POSR_DOCS_SECURITY__;
    if (!api?.open) {
      throw new Error('__POSR_DOCS_SECURITY__ not available — SecurityProvider must expose docs hook');
    }
    api.open('Approve protected action');
  });

  await expect(page.getByTestId('security-modal')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);

  await highlightAndReady(page, page.getByTestId('security-modal'));
  await captureLocator(page.getByTestId('security-modal'), 'security-modal');
  await clearHighlights(page);

  const authTypes = page.getByTestId('security-auth-types');
  if (await authTypes.isVisible().catch(() => false)) {
    await highlightAndReady(page, authTypes);
    await captureLocator(authTypes, 'security-auth-types');
    await clearHighlights(page);
  }

  await highlightAndReady(page, page.getByTestId('security-pin-pad'));
  await captureLocator(page.getByTestId('security-pin-auth'), 'security-pin-pad');
  await clearHighlights(page);

  await page.evaluate(() => {
    (window as Window & { __POSR_DOCS_SECURITY__?: { close: () => void } }).__POSR_DOCS_SECURITY__?.close();
  });
  await page.waitForTimeout(300);
});
