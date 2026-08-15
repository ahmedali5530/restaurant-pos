import { test } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openIntegrationsPage, openIntegrationsTab, resetSession } from '../helpers/auth.ts';
import { captureLocator, capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

test('capture integrations screen', async ({ page }) => {
  test.setTimeout(240_000);
  await resetSession(page);
  await loginWithPin(page);
  await openIntegrationsPage(page);
  await page.waitForTimeout(2_000);

  await highlightAndReady(page, page.getByTestId('integrations-page'));
  await capturePage(page, 'integrations-overview', { fullPage: false });
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('integrations-tabs'));
  await captureLocator(page.getByTestId('integrations-tabs'), 'integrations-tabs');
  await clearHighlights(page);

  await highlightAndReady(page, page.getByTestId('integrations-panel-providers'));
  await captureLocator(page.getByTestId('integrations-panel-providers'), 'integrations-providers');
  await clearHighlights(page);

  await openIntegrationsTab(page, 'configuration');
  await highlightAndReady(page, page.getByTestId('integrations-page'));
  await capturePage(page, 'integrations-configuration', { fullPage: false });
  await clearHighlights(page);

  await openIntegrationsTab(page, 'health');
  await highlightAndReady(page, page.getByTestId('integrations-page'));
  await capturePage(page, 'integrations-health', { fullPage: false });
  await clearHighlights(page);

  await openIntegrationsTab(page, 'queue');
  await highlightAndReady(page, page.getByTestId('integrations-page'));
  await capturePage(page, 'integrations-queue', { fullPage: false });
  await clearHighlights(page);
});
