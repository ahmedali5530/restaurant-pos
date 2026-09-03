import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { docsGuideLangCode } from './paths.ts';

export function docsBaseURL(): string {
  return process.env.DOCS_BASE_URL || 'http://localhost:5173';
}

export function docsLoginPin(): string {
  return process.env.DOCS_LOGIN_PIN || '5555';
}

export function docsUsername(): string {
  return process.env.DOCS_USERNAME || '';
}

export function docsPassword(): string {
  return process.env.DOCS_PASSWORD || '';
}

/**
 * Set app UI language (jotai app-page) so screenshots match the guide locale.
 * Call after localStorage is cleared and the origin is loaded.
 * Merges with default app-page shape so partial keys do not blank required state.
 */
export async function applyDocsAppLanguage(page: Page): Promise<void> {
  const language = docsGuideLangCode();
  const direction = language === 'ar' ? 'rtl' : 'ltr';
  await page.evaluate(
    ({ language, direction }) => {
      try {
        const key = 'app-page';
        let prev: Record<string, unknown> = {};
        try {
          prev = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>;
        } catch {
          prev = {};
        }
        const base: Record<string, unknown> = {
          page: 'Login',
          touch: true,
          language,
          direction,
          menuConfig: {
            showTotalInCart: false,
            showTotalInOrderCard: false,
            showGroupsInOrderCard: false,
            showQuantityInOrderCard: false,
            showPriceInOrderCard: false,
            showModifierPriceInOrderCard: false,
            showModifiersInOrderCard: false,
            enableDishSearch: false,
            showDishNumber: true,
            dishSearchType: 'number',
          },
        };
        const next = {
          ...base,
          ...prev,
          language,
          direction,
          menuConfig: {
            ...(base.menuConfig as object),
            ...((prev.menuConfig as object) || {}),
          },
        };
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    { language, direction }
  );
}

/** Wait until the login screen (or an already-authenticated app route) is ready. */
async function waitForLoginOrApp(page: Page): Promise<void> {
  const loginPage = page.getByTestId('login-page');
  const pinPad = page.getByTestId('login-pin-pad');
  const appRoute = /\/(menu|settings|orders|admin|inventory|accounts|hr|integrations|clock|summary|kitchen|delivery|closing|reports|tip-distribution|order-display)/;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (await loginPage.isVisible().catch(() => false)) return;
    if (await pinPad.isVisible().catch(() => false)) return;
    if (page.url().match(appRoute)) return;
    await page.waitForTimeout(2_000);
  }

  await expect(loginPage.or(pinPad)).toBeVisible({ timeout: 90_000 });
}

/** Clear local session so login screen is shown, then apply docs UI language. */
export async function resetSession(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });
  await applyDocsAppLanguage(page);
  await page.reload({ waitUntil: 'networkidle' });
  await waitForLoginOrApp(page);
  const language = docsGuideLangCode();
  await expect(page.locator('html')).toHaveAttribute('lang', language, { timeout: 15_000 });
}

/**
 * Force floor-plan mode for capture (never tableless).
 * Clears sticky hideTableSelection from earlier docs runs.
 */
export async function ensureFloorMenuMode(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      localStorage.setItem('posr_docs_tableless_leak_recovered', '1');
      const key = 'app-state';
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>;
      } catch {
        data = {};
      }
      data.hideTableSelection = false;
      data.showFloor = true;
      data.showPersons = false;
      data.table = undefined;
      data.cart = [];
      data.orders = Array.isArray(data.orders) ? data.orders : [];
      data.order = { id: 'new', order: undefined };
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  });
  // Keep guide language after app-state tweaks
  await applyDocsAppLanguage(page);
}

export async function dismissClockInIfPresent(page: Page): Promise<void> {
  const clockIn = page.getByTestId('login-clock-in');
  try {
    await clockIn.waitFor({ state: 'visible', timeout: 4_000 });
    await clockIn.click();
  } catch {
    /* no clock-in modal */
  }
}

/** Close the auto-opened What's New dialog so it does not block sidebar clicks. */
export async function dismissWhatsNewIfPresent(page: Page): Promise<void> {
  const dismiss = page.getByTestId('whats-new-dismiss');
  try {
    await dismiss.waitFor({ state: 'visible', timeout: 5_000 });
    await dismiss.click();
    await page
      .locator('.react-aria-ModalOverlay')
      .waitFor({ state: 'hidden', timeout: 10_000 })
      .catch(() => undefined);
  } catch {
    /* dialog not shown */
  }
  await page
    .locator('.react-aria-ModalOverlay')
    .first()
    .waitFor({ state: 'detached', timeout: 3_000 })
    .catch(() => undefined);
}

export async function loginWithPin(page: Page, pin = docsLoginPin()): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await applyDocsAppLanguage(page);
  await page.reload({ waitUntil: 'networkidle' });

  // Recovery if a previous story left a session or the app is still booting
  for (let attempt = 0; attempt < 3; attempt++) {
    const onLogin =
      (await page.getByTestId('login-page').isVisible().catch(() => false)) ||
      (await page.getByTestId('login-pin-pad').isVisible().catch(() => false));
    if (onLogin) break;
    if (page.url().match(/\/(menu|settings|orders|admin|inventory|accounts|hr|integrations|clock|summary|kitchen|delivery|closing|reports|tip-distribution|order-display)/)) {
      // Logged in already — keep language and continue
      await applyDocsAppLanguage(page);
      await dismissWhatsNewIfPresent(page);
      await ensureFloorMenuMode(page);
      await expect(page.locator('html')).toHaveAttribute('lang', docsGuideLangCode(), {
        timeout: 15_000,
      });
      return;
    }
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* ignore */
      }
    });
    await applyDocsAppLanguage(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2_000);
  }

  await waitForLoginOrApp(page);
  await page.getByTestId('login-method-pin').click();
  await expect(page.getByTestId('login-pin-pad')).toBeVisible();

  for (const digit of pin.slice(0, 4)) {
    await page.getByTestId('login-pin-pad').getByRole('button', { name: digit, exact: true }).click();
  }

  await dismissClockInIfPresent(page);
  await page.waitForURL(/\/(menu|settings|orders|admin|inventory|accounts|hr|integrations|clock|summary|kitchen|delivery|closing|reports|tip-distribution|order-display)/, { timeout: 60_000 });
  await dismissWhatsNewIfPresent(page);
  await ensureFloorMenuMode(page);
  await applyDocsAppLanguage(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await dismissWhatsNewIfPresent(page);
  await ensureFloorMenuMode(page);
  await expect(page.locator('html')).toHaveAttribute('lang', docsGuideLangCode(), {
    timeout: 15_000,
  });
}

export async function loginWithForm(
  page: Page,
  username = docsUsername(),
  password = docsPassword()
): Promise<void> {
  if (!username || !password) {
    throw new Error('DOCS_USERNAME and DOCS_PASSWORD are required for form-login capture');
  }
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await applyDocsAppLanguage(page);
  await page.reload({ waitUntil: 'networkidle' });
  await waitForLoginOrApp(page);
  await page.getByTestId('login-method-form').click();
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await dismissClockInIfPresent(page);
  await page.waitForURL(/\/(menu|settings|orders|admin|inventory|accounts|hr|integrations|clock|summary|kitchen|delivery|closing|reports|tip-distribution|order-display)/, { timeout: 60_000 });
  await dismissWhatsNewIfPresent(page);
  await ensureFloorMenuMode(page);
  await applyDocsAppLanguage(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await dismissWhatsNewIfPresent(page);
  await ensureFloorMenuMode(page);
}

export async function openSettings(page: Page): Promise<void> {
  await dismissWhatsNewIfPresent(page);
  await expect(page.getByTestId('nav-settings')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 30_000 });
}

/** Reload catalog cache so menu/floor/dishes appear for screenshots. */
export async function reloadAppCache(page: Page): Promise<void> {
  await dismissWhatsNewIfPresent(page);
  await closeAllModals(page);
  const nav = page.getByTestId('nav-settings');
  if (await nav.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await nav.click({ force: true });
  } else {
    await page.goto('/settings');
    await applyDocsAppLanguage(page);
  }
  await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 45_000 });
  const cache = page.getByTestId('settings-card-cache');
  await expect(cache).toBeVisible({ timeout: 30_000 });
  await cache.getByRole('button').first().click();
  await page.waitForTimeout(6_000);
  await applyDocsAppLanguage(page);
}

/**
 * Open ordering screen via real floor → table → covers (when required).
 * Does NOT fall back to docs_tableless (that produced empty/error guide PDFs).
 */
export async function openMenuOrdering(page: Page): Promise<void> {
  await dismissWhatsNewIfPresent(page);
  await ensureFloorMenuMode(page);
  await page.goto('/menu');
  await applyDocsAppLanguage(page);
  await page.waitForTimeout(1_500);

  // Already on dish layout (e.g. tableless product setting — forced off above)
  if (await page.getByTestId('menu-page').isVisible().catch(() => false)) {
    return;
  }

  await expect(page.getByTestId('menu-floor'), {
    message:
      'Floor plan not visible. Run Settings → Cache → Reload cache first (docs capture calls reloadAppCache before ordering).',
  }).toBeVisible({
    timeout: 45_000,
  });

  await clickFirstFloorTable(page);
  await page.waitForTimeout(600);

  const persons = page.getByTestId('menu-persons-screen');
  if (await persons.isVisible().catch(() => false)) {
    await persons.getByRole('button', { name: '2', exact: true }).click();
    await page.getByTestId('menu-persons-ok').click();
    await page.waitForTimeout(400);
  }

  await expect(page.getByTestId('menu-page'), {
    message:
      'Menu ordering screen did not open after selecting a table. Check that the table is not locked and closing cycle is not blocking orders.',
  }).toBeVisible({ timeout: 30_000 });
}

export async function clickFirstFloorTable(page: Page): Promise<void> {
  await expect(page.getByTestId('floor-table').first(), {
    message:
      'No floor tables found for docs capture. Create floors/tables in Manage and run Reload cache in Settings, then re-run docs:guide:capture.',
  }).toBeVisible({ timeout: 45_000 });
  await page.getByTestId('floor-table').first().click({ force: true });
}

/** Wait until at least one dish tile is ready (catalog loaded). */
export async function waitForDishes(page: Page): Promise<void> {
  await expect(page.getByTestId('menu-dish').first(), {
    message:
      'No dishes on the menu for docs capture. Activate menus, load dishes, run Settings → Cache → Reload cache, then re-run capture.',
  }).toBeVisible({ timeout: 45_000 });
}

/** Add first dish tile that does not open a blocking modal (modifiers). */
export async function addFirstPlainDish(page: Page): Promise<void> {
  const count = await page.getByTestId('menu-dish').count();
  let added = false;
  for (let i = 0; i < Math.min(count, 20); i++) {
    await page.getByTestId('menu-dish').nth(i).click();
    await page.waitForTimeout(400);
    if (await page.locator('.react-aria-ModalOverlay').isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      continue;
    }
    added = true;
    break;
  }
  expect(added, 'Could not add a dish without a blocking modifier modal').toBeTruthy();
}

/**
 * Floor → table → dish → To kitchen (saves open check for Orders screen).
 */
export async function sendOrderToKitchen(page: Page): Promise<void> {
  await openMenuOrdering(page);
  await waitForDishes(page);
  await addFirstPlainDish(page);
  await expect(page.getByTestId('cart-to-kitchen')).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId('cart-to-kitchen').click();
  await page.waitForTimeout(1_500);
}

export async function openOrdersPage(page: Page): Promise<void> {
  await dismissWhatsNewIfPresent(page);
  await closeAllModals(page);
  const nav = page.getByTestId('nav-orders');
  if (await nav.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await nav.click({ force: true });
  } else {
    await page.goto('/orders');
    await applyDocsAppLanguage(page);
  }
  await expect(page.getByTestId('orders-page')).toBeVisible({ timeout: 45_000 });
}

export async function clickSidebarNav(page: Page, testId: string): Promise<void> {
  await dismissWhatsNewIfPresent(page);
  await expect(page.getByTestId(testId)).toBeVisible({ timeout: 30_000 });
  await page.getByTestId(testId).click();
}

export async function openSummaryPage(page: Page): Promise<void> {
  await clickSidebarNav(page, 'nav-summary');
  await expect(page.getByTestId('summary-page')).toBeVisible({ timeout: 45_000 });
}

export async function openKitchenPage(page: Page): Promise<void> {
  await clickSidebarNav(page, 'nav-kitchen');
  await expect(page.getByTestId('kitchen-page')).toBeVisible({ timeout: 45_000 });
}

export async function openOrderDisplayPage(page: Page): Promise<void> {
  await clickSidebarNav(page, 'nav-order-display');
  await expect(page.getByTestId('order-display-page')).toBeVisible({ timeout: 45_000 });
}

export async function openDeliveryPage(page: Page): Promise<void> {
  await clickSidebarNav(page, 'nav-delivery');
  await expect(page.getByTestId('delivery-page')).toBeVisible({ timeout: 45_000 });
}

export async function openClosingPage(page: Page): Promise<void> {
  await clickSidebarNav(page, 'nav-closing');
  await expect(page.getByTestId('closing-page')).toBeVisible({ timeout: 60_000 });
}

export async function openReportsPage(page: Page): Promise<void> {
  await clickSidebarNav(page, 'nav-reports');
  await expect(page.getByTestId('reports-page')).toBeVisible({ timeout: 45_000 });
}

export async function openTipDistributionPage(page: Page): Promise<void> {
  await clickSidebarNav(page, 'nav-tip-distribution');
  await expect(page.getByTestId('tip-distribution-page')).toBeVisible({ timeout: 45_000 });
}

export async function openAdminPage(page: Page): Promise<void> {
  await clickSidebarNav(page, 'nav-admin');
  await expect(page.getByTestId('admin-page')).toBeVisible({ timeout: 45_000 });
}

export async function openAdminTab(page: Page, tabKey: string): Promise<void> {
  await closeAllModals(page);
  await page.getByTestId(`admin-tab-${tabKey}`).click();
  await expect(page.getByTestId(`admin-panel-${tabKey}`)).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(800);
}

const ADMIN_USERS_SUB_TAB_IDS: Record<string, string> = {
  users: 'admin-users-tab-users',
  roles: 'admin-users-tab-roles',
  shifts: 'admin-users-tab-shifts',
  tips_definition: 'admin-users-tab-tips_definition',
};

export async function openAdminUsersSubTab(page: Page, subTabKey: string): Promise<void> {
  const testId = ADMIN_USERS_SUB_TAB_IDS[subTabKey];
  if (!testId) throw new Error(`Unknown admin users sub-tab: ${subTabKey}`);
  await page.getByTestId(testId).click();
  await expect(page.getByTestId(testId)).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(800);
}

const ADMIN_DISCOUNTS_SUB_TAB_IDS: Record<string, string> = {
  rules: 'admin-discounts-tab-rules',
  reasons: 'admin-discounts-tab-reasons',
  permissions: 'admin-discounts-tab-permissions',
};

export async function openAdminDiscountsSubTab(page: Page, subTabKey: string): Promise<void> {
  const testId = ADMIN_DISCOUNTS_SUB_TAB_IDS[subTabKey];
  if (!testId) throw new Error(`Unknown admin discounts sub-tab: ${subTabKey}`);
  await page.getByTestId(testId).click();
  await expect(page.getByTestId(testId)).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(800);
}

export async function openInventoryPage(page: Page): Promise<void> {
  await clickSidebarNav(page, 'nav-inventory');
  await expect(page.getByTestId('inventory-page')).toBeVisible({ timeout: 45_000 });
}

export async function openInventoryTab(page: Page, tabKey: string): Promise<void> {
  await closeAllModals(page);
  await page.getByTestId(`inventory-tab-${tabKey}`).click();
  await expect(page.getByTestId(`inventory-panel-${tabKey}`)).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(800);
}

export async function openAccountsPage(page: Page): Promise<void> {
  await clickSidebarNav(page, 'nav-accounts');
  await expect(page.getByTestId('accounts-page')).toBeVisible({ timeout: 45_000 });
}

export async function openAccountsTab(page: Page, tabKey: string): Promise<void> {
  await page.getByTestId(`accounts-tab-${tabKey}`).click();
  await expect(page.getByTestId(`accounts-panel-${tabKey}`)).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(800);
}

export async function openHrPage(page: Page): Promise<void> {
  await clickSidebarNav(page, 'nav-hr');
  await expect(page.getByTestId('hr-page')).toBeVisible({ timeout: 45_000 });
}

export async function openHrTab(page: Page, tabKey: string): Promise<void> {
  await closeAllModals(page);
  await page.getByTestId(`hr-tab-${tabKey}`).click();
  await expect(page.getByTestId(`hr-panel-${tabKey}`)).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(800);
}

export async function openIntegrationsPage(page: Page): Promise<void> {
  await clickSidebarNav(page, 'nav-integrations');
  await expect(page.getByTestId('integrations-page')).toBeVisible({ timeout: 45_000 });
}

export async function openIntegrationsTab(page: Page, tabKey: string): Promise<void> {
  await page.getByTestId(`integrations-tab-${tabKey}`).click();
  await expect(page.getByTestId(`integrations-panel-${tabKey}`)).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(800);
}

/**
 * Floor → table → dish → Pay now. Leaves payment screen open.
 * Does not complete the order (capture only).
 */
export async function openPaymentScreen(page: Page): Promise<void> {
  await openMenuOrdering(page);
  await waitForDishes(page);
  await addFirstPlainDish(page);
  await expect(page.getByTestId('cart-pay-now')).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId('cart-pay-now').click();
  await expect(page.getByTestId('payment-screen'), {
    message:
      'Payment screen did not open. Ensure floor/table path created a valid order (not table undefined).',
  }).toBeVisible({ timeout: 60_000 });
}

/** Close the topmost app modal (X button — ESC is disabled on most forms). */
export async function closeTopModal(page: Page): Promise<void> {
  const overlays = page.locator('.react-aria-ModalOverlay');
  const count = await overlays.count();
  if (count === 0) return;
  const overlay = overlays.last();
  if (!(await overlay.isVisible().catch(() => false))) return;
  const closeBtn = overlay.getByTestId('modal-close');
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click({ force: true });
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(400);
}

/** Close every stacked modal overlay before tab navigation or the next capture step. */
export async function closeAllModals(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const visible = page.locator('.react-aria-ModalOverlay');
    if ((await visible.count()) === 0) break;
    if (!(await visible.last().isVisible().catch(() => false))) break;
    await closeTopModal(page);
  }
}

/** Dismiss manager PIN overlay when super-admin re-auth appears during docs capture. */
export async function dismissSecurityModal(page: Page): Promise<void> {
  const overlays = page.locator('.react-aria-ModalOverlay');
  if ((await overlays.count()) === 0) return;
  const pinPad = overlays.last().locator('button', { hasText: /^[0-9]$/ });
  if ((await pinPad.count()) < 4) return;
  const pin = docsLoginPin();
  for (const digit of pin.slice(0, 4)) {
    const overlay = page.locator('.react-aria-ModalOverlay').last();
    const btn = overlay.getByRole('button', { name: digit, exact: true });
    if (!(await btn.isVisible().catch(() => false))) break;
    await btn.click({ force: true });
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(600);
}

/** Pay a check (creates a Paid order for refund docs). */
export async function completeOrderWithCash(page: Page): Promise<void> {
  await openPaymentScreen(page);
  await page.getByTestId('payment-quick-exact').click();
  await page.waitForTimeout(400);
  await page.getByTestId('payment-complete').click();
  await page.waitForTimeout(800);
  await dismissSecurityModal(page);
  await page.waitForTimeout(1_500);
  await page.keyboard.press('Escape').catch(() => {});
  await closeAllModals(page);
  await page.waitForTimeout(500);
}

export async function openOrderCardMenu(page: Page, cardIndex = 0): Promise<void> {
  await closeAllModals(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const card = page.getByTestId('order-card').nth(cardIndex);
  await card.scrollIntoViewIfNeeded();
  await card.getByTestId('order-card-menu').click({ force: true });
  await expect(page.getByRole('menu').last()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(300);
}

const ORDER_MENU_LABELS: Record<string, RegExp> = {
  cancel: /cancel order/i,
  split_by_seats: /split by seats/i,
  split_by_items: /split by items/i,
  split_by_amount: /split by amount/i,
  merge: /merge orders/i,
  refund: /refund/i,
};

export async function clickOrderMenuAction(page: Page, actionId: string): Promise<void> {
  const menu = page.getByRole('menu').last();
  await expect(menu).toBeVisible({ timeout: 15_000 });
  const byTestId = page.getByTestId(`order-menu-${actionId}`);
  if (await byTestId.isVisible().catch(() => false)) {
    await byTestId.click({ force: true });
  } else {
    const pattern = ORDER_MENU_LABELS[actionId] ?? new RegExp(actionId.replace(/_/g, ' '), 'i');
    await menu.getByRole('menuitem', { name: pattern }).click({ force: true });
  }
  await dismissSecurityModal(page);
  await page.waitForTimeout(600);
}

