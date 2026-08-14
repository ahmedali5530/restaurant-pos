#!/usr/bin/env node
/**
 * Wave 10 catalog verification.
 *
 * guide-catalog.mjs already lists these chapter keys:
 *
 * Inventory guide:
 *   inventory-reconciliation, inventory-production, inventory-buffet
 *
 * HR guide:
 *   hr-cost-centers, hr-pay, hr-payroll, hr-documents, hr-performance
 *
 * Run this script after generate-wave10-locales.mjs to confirm locale files exist.
 * No catalog mutation is required for Wave 10.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDES } from './guide-catalog.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES = path.resolve(__dirname, '../docs/user-guide/locales/en');

const WAVE10_KEYS = [
  'orders',
  'accounts-ledgers',
  'inventory-reconciliation',
  'inventory-production',
  'inventory-buffet',
  'hr-cost-centers',
  'hr-pay',
  'hr-payroll',
  'hr-documents',
  'hr-performance',
  'hr-employees',
  'hr-attendance',
  'hr-leave',
  'admin-menus',
  'admin-floors',
  'admin-promotions',
  'admin-kitchen',
  'admin-printing',
  'admin-payments',
  'admin-users',
];

const inventoryGuide = GUIDES.find((g) => g.id === 'inventory');
const hrGuide = GUIDES.find((g) => g.id === 'hr');

for (const key of ['inventory-reconciliation', 'inventory-production', 'inventory-buffet']) {
  if (!inventoryGuide?.chapters.some((c) => c.key === key)) {
    console.error(`Missing inventory catalog key: ${key}`);
    process.exit(1);
  }
}

for (const key of ['hr-cost-centers', 'hr-pay', 'hr-payroll', 'hr-documents', 'hr-performance']) {
  if (!hrGuide?.chapters.some((c) => c.key === key)) {
    console.error(`Missing HR catalog key: ${key}`);
    process.exit(1);
  }
}

let missing = 0;
for (const key of WAVE10_KEYS) {
  const file = path.join(LOCALES, `${key}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`locale missing: en/${key}.json`);
    missing++;
  }
}

if (missing) {
  console.error(`${missing} Wave 10 locale file(s) missing — run: node docs-automation/generate-wave10-locales.mjs`);
  process.exit(1);
}

console.log('Wave 10 catalog keys present; all English locale files found.');
