/**
 * POSR Documentation catalog — single source of truth for multi-guide structure.
 * Used by assemble.mjs and print-pdf.mjs on every docs build.
 *
 * Tree:
 *   POSR Documentation
 *   ├── Employee Guide
 *   ├── Manager Guide
 *   ├── Inventory Guide
 *   ├── Accounts Guide
 *   ├── HR Guide
 *   └── Administrator Guide
 *
 * Chapters with key present map to locales/{lang}/{key}.json when the file exists.
 * Planned keys without a locale file render as “Coming soon” in the guide PDF/HTML.
 */

/** App language codes → locale/image folder. */
export const LANGS = [
  { code: 'en', folder: 'en', dir: 'ltr' },
  { code: 'es', folder: 'es', dir: 'ltr' },
  { code: 'tr', folder: 'tr', dir: 'ltr' },
  { code: 'pt-BR', folder: 'pt-br', dir: 'ltr' },
  { code: 'fr', folder: 'fr', dir: 'ltr' },
  { code: 'nl', folder: 'nl', dir: 'ltr' },
  { code: 'de', folder: 'de', dir: 'ltr' },
  { code: 'it', folder: 'it', dir: 'ltr' },
  { code: 'ar', folder: 'ar', dir: 'rtl' },
  { code: 'ru', folder: 'ru', dir: 'ltr' },
];

/**
 * @typedef {{ key: string, plannedTitle?: string }} ChapterRef
 * @typedef {{
 *   id: string,
 *   emoji: string,
 *   folder: string,
 *   pdfName: string,
 *   defaultTitle: string,
 *   defaultIntro: string,
 *   chapters: ChapterRef[],
 * }} GuideDef
 */

/** @type {GuideDef[]} */
export const GUIDES = [
  {
    id: 'employee',
    emoji: '📘',
    folder: 'employee',
    pdfName: 'posr-employee-guide.pdf',
    defaultTitle: 'Employee Guide',
    defaultIntro:
      'Day-to-day POS work for floor staff: sign-in, take orders, cart and payment, manage open checks, lock the terminal, and clock out.',
    chapters: [
      { key: 'login' },
      { key: 'menu' },
      { key: 'cart' },
      { key: 'payment' },
      { key: 'orders' },
      { key: 'session' },
      { key: 'settings' },
      { key: 'tables', plannedTitle: 'Tables and dine-in (deep dive)' },
      { key: 'security-auth', plannedTitle: 'Security re-authentication' },
    ],
  },
  {
    id: 'manager',
    emoji: '📗',
    folder: 'manager',
    pdfName: 'posr-manager-guide.pdf',
    defaultTitle: 'Manager Guide',
    defaultIntro:
      'Shift leadership screens: sales summary, kitchen board, delivery, closing, and operational reports.',
    chapters: [
      { key: 'summary', plannedTitle: 'Summary' },
      { key: 'kitchen', plannedTitle: 'Kitchen' },
      { key: 'order-display', plannedTitle: 'Order display' },
      { key: 'delivery', plannedTitle: 'Delivery' },
      { key: 'closing', plannedTitle: 'Closing' },
      { key: 'reports-ops', plannedTitle: 'Reports (operations)' },
      { key: 'tips-manager', plannedTitle: 'Tip oversight' },
    ],
  },
  {
    id: 'inventory',
    emoji: '📙',
    folder: 'inventory',
    pdfName: 'posr-inventory-guide.pdf',
    defaultTitle: 'Inventory Guide',
    defaultIntro: 'Stock, purchases, issues, wastes, and inventory counts for the warehouse role.',
    chapters: [
      { key: 'inventory-overview', plannedTitle: 'Inventory overview' },
      { key: 'inventory-items', plannedTitle: 'Items and stock' },
      { key: 'inventory-purchases', plannedTitle: 'Purchases' },
      { key: 'inventory-issues', plannedTitle: 'Issues and returns' },
      { key: 'inventory-wastes', plannedTitle: 'Wastes' },
      { key: 'inventory-counts', plannedTitle: 'Stock counts' },
    ],
  },
  {
    id: 'accounts',
    emoji: '📕',
    folder: 'accounts',
    pdfName: 'posr-accounts-guide.pdf',
    defaultTitle: 'Accounts Guide',
    defaultIntro: 'Financial ledgers, expenses, and accounting-related POS tools.',
    chapters: [
      { key: 'accounts-overview', plannedTitle: 'Accounts overview' },
      { key: 'accounts-expenses', plannedTitle: 'Expenses' },
      { key: 'accounts-ledgers', plannedTitle: 'Ledgers and balances' },
    ],
  },
  {
    id: 'hr',
    emoji: '📒',
    folder: 'hr',
    pdfName: 'posr-hr-guide.pdf',
    defaultTitle: 'HR Guide',
    defaultIntro: 'People operations: employees, attendance, leave, payroll-related views, and tip distribution.',
    chapters: [
      { key: 'hr-overview', plannedTitle: 'HR overview' },
      { key: 'hr-employees', plannedTitle: 'Employees' },
      { key: 'hr-attendance', plannedTitle: 'Attendance' },
      { key: 'hr-leave', plannedTitle: 'Leave' },
      { key: 'tip-distribution', plannedTitle: 'Tip distribution' },
    ],
  },
  {
    id: 'admin',
    emoji: '📓',
    folder: 'admin',
    pdfName: 'posr-administrator-guide.pdf',
    defaultTitle: 'Administrator Guide',
    defaultIntro:
      'Venue configuration: Manage (menus, floors, users, taxes…), integrations, and advanced settings.',
    chapters: [
      { key: 'admin-overview', plannedTitle: 'Manage overview' },
      { key: 'admin-menus', plannedTitle: 'Menus, categories, dishes' },
      { key: 'admin-floors', plannedTitle: 'Floors and tables' },
      { key: 'admin-users', plannedTitle: 'Users and roles' },
      { key: 'admin-payments', plannedTitle: 'Payment types and taxes' },
      { key: 'integrations', plannedTitle: 'Integrations' },
      { key: 'settings-advanced', plannedTitle: 'Advanced device settings' },
      { key: 'reports-admin', plannedTitle: 'Reports hub' },
    ],
  },
];

/** Flat list of every chapter key that can have a locale JSON file (for browse copies). */
export function allChapterKeys() {
  const keys = new Set();
  for (const g of GUIDES) {
    for (const ch of g.chapters) keys.add(ch.key);
  }
  return [...keys];
}

/** Chapter keys that are currently expected to exist for Employee (shipping content). */
export function shippedChapterKeys() {
  return GUIDES.flatMap((g) =>
    g.chapters
      .filter((c) => !c.plannedTitle || c.key.match(/^(login|settings|menu|cart|payment|orders|session)$/))
      .map((c) => c.key)
  );
}

export function getGuideById(id) {
  return GUIDES.find((g) => g.id === id);
}
