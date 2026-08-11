import { test, expect } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import {
  docsPassword,
  docsUsername,
  resetSession,
} from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture login PIN screen', async ({ page }) => {
  await resetSession(page);
  await expect(page.getByTestId('login-method-pin')).toBeVisible();

  await highlightAndReady(page, [
    page.getByTestId('login-method-pin'),
    page.getByTestId('login-method-form'),
    page.getByTestId('login-pin-pad'),
  ]);

  await capturePage(page, 'login-pin', { fullPage: false });
  await clearHighlights(page);
});

test('capture login Form screen', async ({ page }) => {
  await resetSession(page);
  await page.getByTestId('login-method-form').click();
  await expect(page.getByTestId('login-form')).toBeVisible();

  // Prefill demo fields when available so the screenshot looks realistic
  const username = docsUsername();
  const password = docsPassword();
  if (username) {
    await page.getByTestId('login-username').fill(username);
  } else {
    await page.getByTestId('login-username').fill('cashier');
  }
  if (password) {
    await page.getByTestId('login-password').fill(password);
  } else {
    await page.getByTestId('login-password').fill('••••••••');
  }

  await highlightAndReady(page, [
    page.getByTestId('login-method-form'),
    page.getByTestId('login-username'),
    page.getByTestId('login-password'),
    page.getByTestId('login-submit'),
  ]);

  await capturePage(page, 'login-form', { fullPage: false });
  await clearHighlights(page);
});

test('capture login method toggle detail', async ({ page }) => {
  await resetSession(page);
  await highlightAndReady(page, [
    page.getByTestId('login-method-pin'),
    page.getByTestId('login-method-form'),
  ]);
  await captureLocator(
    page.locator('[data-testid="login-method-pin"]').locator('..'),
    'login-method-toggle'
  );
  await clearHighlights(page);
});
