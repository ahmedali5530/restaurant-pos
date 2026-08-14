import { expect, type Page } from '@playwright/test';
import { closeAllModals, openAdminTab, openHrTab } from './auth.ts';

/** Manage tab key → Add button and form dialog testids */
export const ADMIN_FORM_IDS: Record<string, { add: string; form: string }> = {
  dishes: { add: 'admin-add-dishes', form: 'admin-form-dish' },
  menus: { add: 'admin-add-menus', form: 'admin-form-menu' },
  categories: { add: 'admin-add-categories', form: 'admin-form-category' },
  modifier_groups: { add: 'admin-add-modifier_groups', form: 'admin-form-modifier-group' },
  tables: { add: 'admin-add-tables', form: 'admin-form-table' },
  floors: { add: 'admin-add-floors', form: 'admin-form-floor' },
  discounts: { add: 'admin-add-discounts', form: 'admin-form-discount' },
  coupons: { add: 'admin-add-coupons', form: 'admin-form-coupon' },
  kitchens: { add: 'admin-add-kitchens', form: 'admin-form-kitchen' },
  workflows: { add: 'admin-add-workflows', form: 'admin-form-workflow' },
  printers: { add: 'admin-add-printers', form: 'admin-form-printer' },
  print_settings: { add: 'admin-add-print_settings', form: 'admin-form-print-setting' },
  order_types: { add: 'admin-add-order_types', form: 'admin-form-order-type' },
  payment_types: { add: 'admin-add-payment_types', form: 'admin-form-payment-type' },
  extras: { add: 'admin-add-extras', form: 'admin-form-extra' },
  taxes: { add: 'admin-add-taxes', form: 'admin-form-tax' },
};

export const HR_FORM_IDS: Record<string, { add: string; form: string }> = {
  employees: { add: 'hr-add-employees', form: 'hr-form-employee' },
  departments: { add: 'hr-add-departments', form: 'hr-form-department' },
  positions: { add: 'hr-add-positions', form: 'hr-form-position' },
  'cost-centers': { add: 'hr-add-cost-centers', form: 'hr-form-cost-center' },
  'pay-profiles': { add: 'hr-add-pay-profiles', form: 'hr-form-pay-profile' },
  'pay-rules': { add: 'hr-add-pay-rules', form: 'hr-form-pay-rule' },
  scheduling: { add: 'hr-add-scheduling', form: 'hr-form-schedule' },
  attendance: { add: 'hr-add-attendance', form: 'hr-form-attendance' },
  leave: { add: 'hr-add-leave', form: 'hr-form-leave' },
  holidays: { add: 'hr-add-holidays', form: 'hr-form-holiday' },
  'payroll-periods': { add: 'hr-add-payroll-periods', form: 'hr-form-payroll-period' },
  'payroll-runs': { add: 'hr-add-payroll-runs', form: 'hr-form-payroll-run' },
  adjustments: { add: 'hr-add-adjustments', form: 'hr-form-adjustment' },
  documents: { add: 'hr-add-documents', form: 'hr-form-document' },
  performance: { add: 'hr-add-performance', form: 'hr-form-performance' },
};

export async function openAdminAddForm(page: Page, tabKey: string): Promise<void> {
  const ids = ADMIN_FORM_IDS[tabKey];
  if (!ids) throw new Error(`Unknown admin form tab: ${tabKey}`);
  await closeAllModals(page);
  await openAdminTab(page, tabKey);
  const addBtn = page.getByTestId(ids.add);
  if (await addBtn.isVisible().catch(() => false)) {
    await addBtn.click();
  } else {
    await page.getByRole('button', { name: /add|create|new/i }).first().click();
  }
  await expect(page.getByTestId(ids.form)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
}

export async function openHrAddForm(page: Page, tabKey: string): Promise<void> {
  const ids = HR_FORM_IDS[tabKey];
  if (!ids) throw new Error(`Unknown HR form tab: ${tabKey}`);
  await closeAllModals(page);
  await openHrTab(page, tabKey);
  const addBtn = page.getByTestId(ids.add);
  if (await addBtn.isVisible().catch(() => false)) {
    await addBtn.click();
  } else {
    await page.getByRole('button', { name: /add|create|new/i }).first().click();
  }
  await expect(page.getByTestId(ids.form)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
}

export async function captureAdminForm(
  page: Page,
  tabKey: string,
  imageName: string,
  capturePage: (page: Page, name: string, opts?: { fullPage?: boolean }) => Promise<void>,
  highlightAndReady: (page: Page, locator: unknown) => Promise<void>,
  clearHighlights: (page: Page) => Promise<void>
): Promise<void> {
  await openAdminAddForm(page, tabKey);
  const form = page.getByTestId(ADMIN_FORM_IDS[tabKey].form);
  await highlightAndReady(page, form);
  await capturePage(page, imageName, { fullPage: false });
  await clearHighlights(page);
  await closeAllModals(page);
  await page.waitForTimeout(300);
}

export async function captureHrForm(
  page: Page,
  tabKey: string,
  imageName: string,
  capturePage: (page: Page, name: string, opts?: { fullPage?: boolean }) => Promise<void>,
  highlightAndReady: (page: Page, locator: unknown) => Promise<void>,
  clearHighlights: (page: Page) => Promise<void>
): Promise<void> {
  await openHrAddForm(page, tabKey);
  const form = page.getByTestId(HR_FORM_IDS[tabKey].form);
  await highlightAndReady(page, form);
  await capturePage(page, imageName, { fullPage: false });
  await clearHighlights(page);
  await closeAllModals(page);
  await page.waitForTimeout(300);
}
