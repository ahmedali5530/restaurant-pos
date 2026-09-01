import { test, expect } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openHrPage, openHrTab, resetSession, closeAllModals } from '../helpers/auth.ts';
import { captureHrForm } from '../helpers/forms.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

const HR_FORM_CAPTURES: Array<{ tab: string; image: string }> = [
  { tab: 'employees', image: 'hr-form-employee' },
  { tab: 'departments', image: 'hr-form-department' },
  { tab: 'positions', image: 'hr-form-position' },
  { tab: 'cost-centers', image: 'hr-form-cost-center' },
  { tab: 'pay-profiles', image: 'hr-form-pay-profile' },
  { tab: 'pay-rules', image: 'hr-form-pay-rule' },
  { tab: 'attendance', image: 'hr-form-attendance' },
  { tab: 'leave', image: 'hr-form-leave' },
  { tab: 'holidays', image: 'hr-form-holiday' },
  { tab: 'payroll-periods', image: 'hr-form-payroll-period' },
  { tab: 'payroll-runs', image: 'hr-form-payroll-run' },
  { tab: 'adjustments', image: 'hr-form-adjustment' },
  { tab: 'documents', image: 'hr-form-document' },
  { tab: 'performance', image: 'hr-form-performance' },
];

test('capture hr form modals', async ({ page }) => {
  test.setTimeout(600_000);
  await resetSession(page);
  await loginWithPin(page);
  await openHrPage(page);
  await page.waitForTimeout(1_500);

  for (const { tab, image } of HR_FORM_CAPTURES) {
    await captureHrForm(page, tab, image, capturePage, highlightAndReady, clearHighlights);
  }

  // Scheduling sub-forms
  await openHrTab(page, 'scheduling');
  await page.waitForTimeout(800);

  await page.getByTestId('hr-add-schedule').click();
  await expect(page.getByTestId('hr-form-schedule')).toBeVisible({ timeout: 15_000 });
  await highlightAndReady(page, page.getByTestId('hr-form-schedule'));
  await capturePage(page, 'hr-form-schedule', { fullPage: false });
  await clearHighlights(page);
  await closeAllModals(page);

  await page.getByTestId('hr-scheduling-tab-shifts').click();
  await page.waitForTimeout(400);
  await page.getByTestId('hr-add-schedule-shift').click();
  await expect(page.getByTestId('hr-form-shift')).toBeVisible({ timeout: 15_000 });
  await highlightAndReady(page, page.getByTestId('hr-form-shift'));
  await capturePage(page, 'hr-form-shift', { fullPage: false });
  await clearHighlights(page);
  await closeAllModals(page);

  await page.getByTestId('hr-scheduling-tab-templates').click();
  await page.waitForTimeout(400);
  await page.getByTestId('hr-add-schedule-template').click();
  await expect(page.getByTestId('hr-form-schedule-template')).toBeVisible({ timeout: 15_000 });
  await highlightAndReady(page, page.getByTestId('hr-form-schedule-template'));
  await capturePage(page, 'hr-form-schedule-template', { fullPage: false });
  await clearHighlights(page);
  await closeAllModals(page);

  await page.getByTestId('hr-scheduling-tab-schedules').click();
  await page.waitForTimeout(400);
  await page.getByTestId('hr-add-schedule-generate').click();
  await expect(page.getByTestId('hr-form-schedule-generate')).toBeVisible({ timeout: 15_000 });
  await highlightAndReady(page, page.getByTestId('hr-form-schedule-generate'));
  await capturePage(page, 'hr-form-schedule-generate', { fullPage: false });
  await clearHighlights(page);
  await closeAllModals(page);

  await page.getByTestId('hr-scheduling-tab-swaps').click();
  await page.waitForTimeout(400);
  await page.getByTestId('hr-add-schedule-swap').click();
  await expect(page.getByTestId('hr-form-schedule-swap')).toBeVisible({ timeout: 15_000 });
  await highlightAndReady(page, page.getByTestId('hr-form-schedule-swap'));
  await capturePage(page, 'hr-form-schedule-swap', { fullPage: false });
  await clearHighlights(page);
});
