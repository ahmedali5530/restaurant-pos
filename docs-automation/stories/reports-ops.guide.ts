import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openReportsPage, resetSession } from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture reports hub', async ({ page }) => {
  test.setTimeout(180_000);
  await resetSession(page);
  await loginWithPin(page);
  await openReportsPage(page);
  await page.waitForTimeout(1_000);

  await highlightAndReady(page, page.getByTestId('reports-page'));
  await capturePage(page, 'reports-overview', { fullPage: false });
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('reports-categories'));
  await captureLocator(page.getByTestId('reports-categories'), 'reports-categories');
  await clearHighlights(page);

  const firstCategory = page.getByTestId('reports-category-dashboard');
  await firstCategory.click();
  await page.waitForTimeout(500);

  await highlightAndReady(page, page.getByTestId('reports-subreports'));
  await captureLocator(page.getByTestId('reports-subreports'), 'reports-subreports');
  await clearHighlights(page);
});
