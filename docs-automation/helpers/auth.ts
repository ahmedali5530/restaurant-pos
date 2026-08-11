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

/** Clear local session so login screen is shown, then apply docs UI language. */
export async function resetSession(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });
  await applyDocsAppLanguage(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  // Jotai + I18nProvider rehydrate language from app-page on this load
  await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 60_000 });
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
  await page.goto('/');
  await applyDocsAppLanguage(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  // Recovery if a previous story left a session or the app is still booting
  for (let attempt = 0; attempt < 2; attempt++) {
    const onLogin = await page.getByTestId('login-page').isVisible().catch(() => false);
    if (onLogin) break;
    if (page.url().match(/\/(menu|settings|orders|admin|clock)/)) {
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
    await page.reload({ waitUntil: 'domcontentloaded' });
  }

  await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('login-method-pin').click();
  await expect(page.getByTestId('login-pin-pad')).toBeVisible();

  for (const digit of pin.slice(0, 4)) {
    await page.getByTestId('login-pin-pad').getByRole('button', { name: digit, exact: true }).click();
  }

  await dismissClockInIfPresent(page);
  await page.waitForURL(/\/(menu|settings|orders|admin|clock)/, { timeout: 60_000 });
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
  await page.goto('/');
  await applyDocsAppLanguage(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('login-method-form').click();
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await dismissClockInIfPresent(page);
  await page.waitForURL(/\/(menu|settings|orders|admin|clock)/, { timeout: 60_000 });
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
  await openSettings(page);
  const cache = page.getByTestId('settings-card-cache');
  await expect(cache).toBeVisible({ timeout: 30_000 });
  await cache.getByRole('button').first().click();
  await page.waitForTimeout(4_000);
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

  await expect(page.getByTestId('menu-floor')).toBeVisible({
    timeout: 45_000,
  });

  const table = page.getByTestId('floor-table').first();
  await expect(table, {
    message:
      'No floor tables found for docs capture. Create floors/tables in Manage and run Reload cache in Settings, then re-run docs:guide:capture.',
  }).toBeVisible({ timeout: 45_000 });

  await table.click({ force: true });
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
  await page.getByTestId('nav-orders').click();
  await expect(page.getByTestId('orders-page')).toBeVisible({ timeout: 45_000 });
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

