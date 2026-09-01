import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openReportsPage, resetSession } from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture admin reports hub packs', async ({ page }) => {
  test.setTimeout(240_000);
  await resetSession(page);
  await loginWithPin(page);
  await openReportsPage(page);
  await page.waitForTimeout(1_500);

  await highlightAndReady(page, page.getByTestId('reports-page'));
  await capturePage(page, 'reports-admin-overview', { fullPage: false });
  await clearHighlights(page);

  await page.getByTestId('reports-category-inventory').click();
  await page.waitForTimeout(600);
  await highlightAndReady(page, page.getByTestId('reports-page'));
  await capturePage(page, 'reports-admin-inventory', { fullPage: false });
  await clearHighlights(page);

  await page.getByTestId('reports-report-currentInventory').click();
  await page.waitForTimeout(800);
  await highlightAndReady(page, page.getByTestId('reports-filters'));
  await captureLocator(page.getByTestId('reports-filters'), 'reports-admin-inventory-filters');
  await clearHighlights(page);

  await page.getByTestId('reports-category-labor').click();
  await page.waitForTimeout(600);
  await highlightAndReady(page, page.getByTestId('reports-page'));
  await capturePage(page, 'reports-admin-labor', { fullPage: false });
  await clearHighlights(page);

  await page.getByTestId('reports-category-products').click();
  await page.waitForTimeout(600);
  await highlightAndReady(page, page.getByTestId('reports-page'));
  await capturePage(page, 'reports-admin-products', { fullPage: false });
  await clearHighlights(page);

  await page.getByTestId('reports-category-sales').click();
  await page.waitForTimeout(600);
  await page.getByTestId('reports-report-tax').click();
  await page.waitForTimeout(800);
  await highlightAndReady(page, page.getByTestId('reports-filters'));
  await captureLocator(page.getByTestId('reports-filters'), 'reports-admin-tax-filters');
  await clearHighlights(page);
});
