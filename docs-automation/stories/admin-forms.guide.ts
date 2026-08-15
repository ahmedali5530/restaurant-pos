import { test, expect } from '@playwright/test';
import { clearHighlights, highlightAndReady } from '../helpers/highlight.ts';
import { loginWithPin, openAdminPage, openAdminTab, resetSession, closeAllModals } from '../helpers/auth.ts';
import { captureAdminForm } from '../helpers/forms.ts';
import { capturePage } from '../helpers/screenshot.ts';

test.describe.configure({ mode: 'serial' });

const FORM_CAPTURES: Array<{ tab: string; image: string }> = [
  { tab: 'dishes', image: 'admin-menus-dish-form' },
  { tab: 'menus', image: 'admin-menus-menu-form' },
  { tab: 'categories', image: 'admin-menus-category-form' },
  { tab: 'modifier_groups', image: 'admin-menus-modifier-group-form' },
  { tab: 'floors', image: 'admin-floors-floor-form' },
  { tab: 'tables', image: 'admin-floors-table-form' },
  { tab: 'discounts', image: 'admin-promotions-discount-form' },
  { tab: 'coupons', image: 'admin-promotions-coupon-form' },
  { tab: 'kitchens', image: 'admin-kitchen-kitchen-form' },
  { tab: 'workflows', image: 'admin-kitchen-workflow-form' },
  { tab: 'printers', image: 'admin-printing-printer-form' },
  { tab: 'payment_types', image: 'admin-payments-type-form' },
  { tab: 'taxes', image: 'admin-payments-tax-form' },
  { tab: 'order_types', image: 'admin-payments-order-type-form' },
  { tab: 'extras', image: 'admin-payments-extra-form' },
];

test('capture manage form modals', async ({ page }) => {
  test.setTimeout(600_000);
  await resetSession(page);
  await loginWithPin(page);
  await openAdminPage(page);
  await page.waitForTimeout(1_500);

  for (const { tab, image } of FORM_CAPTURES) {
    await captureAdminForm(page, tab, image, capturePage, highlightAndReady, clearHighlights);
  }

  // Print settings — edit first row (no Add button)
  await openAdminTab(page, 'print_settings');
  const editBtn = page.getByTestId('admin-edit-print-setting').first();
  if (await editBtn.isVisible().catch(() => false)) {
    await editBtn.click();
    await page.waitForTimeout(600);
    const form = page.getByTestId('admin-form-print-setting');
    await expect(form).toBeVisible({ timeout: 15_000 });
    await highlightAndReady(page, form);
    await capturePage(page, 'admin-printing-print-setting-form', { fullPage: false });
    await clearHighlights(page);
    await closeAllModals(page);
  }

  // Users → user form
  await openAdminTab(page, 'users');
  await page.getByTestId('admin-add-users').click();
  await expect(page.getByTestId('admin-form-user')).toBeVisible({ timeout: 15_000 });
  await highlightAndReady(page, page.getByTestId('admin-form-user'));
  await capturePage(page, 'admin-users-user-form', { fullPage: false });
  await clearHighlights(page);
  await closeAllModals(page);

  // Roles
  await page.getByTestId('admin-users-tab-roles').click();
  await page.waitForTimeout(500);
  await page.getByTestId('admin-add-roles').click();
  await expect(page.getByTestId('admin-form-role')).toBeVisible({ timeout: 15_000 });
  await highlightAndReady(page, page.getByTestId('admin-form-role'));
  await capturePage(page, 'admin-users-role-form', { fullPage: false });
  await clearHighlights(page);
  await closeAllModals(page);

  // Shifts
  await page.getByTestId('admin-users-tab-shifts').click();
  await page.waitForTimeout(500);
  await page.getByTestId('admin-add-shifts').click();
  await expect(page.getByTestId('admin-form-shift')).toBeVisible({ timeout: 15_000 });
  await highlightAndReady(page, page.getByTestId('admin-form-shift'));
  await capturePage(page, 'admin-users-shift-form', { fullPage: false });
  await clearHighlights(page);
  await closeAllModals(page);

  // Tips definition panel
  await page.getByTestId('admin-users-tab-tips_definition').click();
  await page.waitForTimeout(800);
  await highlightAndReady(page, page.getByTestId('admin-page'));
  await capturePage(page, 'admin-users-tips-definition', { fullPage: false });
  await clearHighlights(page);
});
