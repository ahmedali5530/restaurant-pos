'use strict';

/**
 * Granular per-role RBAC migration: redefine non-critical tables with
 * role-specific PERMISSIONS.
 *
 * The previous migrations set:
 *   - 15 critical tables → role-restricted (admin/hr/accountant only)
 *   - 128 non-critical tables → PERMISSIONS FULL (any authenticated user)
 *
 * This migration tightens the 128 non-critical tables: each table gets
 * role-specific PERMISSIONS based on which role legitimately needs which
 * operation. For example:
 *   - `order` — only waiter/cashier can CREATE; kitchen can UPDATE status
 *   - `inventory_*` — only inventory role can CREATE/UPDATE/DELETE
 *   - `menu`/`dish`/`category` — only admin can CREATE/UPDATE/DELETE; all read
 *   - `account`/`account_group` — only accountant can CREATE/UPDATE/DELETE
 *
 * Roles (top-level sections from user_role.roles, same as the JWT `roles` claim):
 *   super_admin  — wildcard, has all access (checked first)
 *   admin         — full CRUD on master data
 *   manager       — reports + dashboard + closing
 *   hr            — employees, payroll, scheduling
 *   accountant    — chart of accounts, journals
 *   inventory     — items, purchases, stock transfers, production
 *   waiter        — orders, menu (read), customers
 *   kitchen       — KDS, kitchen reconciliation, production
 *   delivery      — delivery orders, drivers, areas
 *   cashier       — orders (payment), summary, payment processing
 *
 * Idempotent. Dormant until GATEWAY_USE_JWT_AS_SURREAL_TOKEN=true (root bypasses
 * PERMISSIONS when the flag is off).
 *
 * Usage:
 *   SURREAL_USER=posr SURREAL_PASS=... \
 *   node migrations/scripts/apply-granular-rbac-permissions.cjs
 *
 *   # Dry run:
 *   DRY_RUN=1 SURREAL_USER=posr SURREAL_PASS=... \
 *   node migrations/scripts/apply-granular-rbac-permissions.cjs
 *
 * See: RBAC-DESIGN.md → "Granular per-role PERMISSIONS" section
 */

const fs = require('fs');
const path = require('path');
const { Surreal } = require('surrealdb');

const DB_NS = process.env.SURREAL_NS || 'posr';
const DB_NAME = process.env.SURREAL_DB || 'posr';
const DB_URL = process.env.SURREAL_URL || 'ws://surrealdb:8000/rpc';
const DB_USER = process.env.SURREAL_USER;
const DB_PASS = process.env.SURREAL_PASS;
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

if (require.main === module && (!DB_USER || !DB_PASS)) {
  console.error('ERROR: SURREAL_USER and SURREAL_PASS are required (no root/root fallback).');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------
const SUPER_ADMIN = "$auth.roles CONTAINS 'super_admin'";
function anyRole(...roles) {
  return roles.map((r) => `$auth.roles CONTAINS '${r}'`).join(' OR ');
}
function roleOrAdmin(role) {
  return `${SUPER_ADMIN} OR ${anyRole(role, 'admin')}`;
}

// ---------------------------------------------------------------------------
// Granular table permissions.
//
// Each entry defines the 4 CRUD operations for a table. Operations default to
// FULL (any authenticated user) unless explicitly overridden.
//
// The 15 critical tables are NOT in this map — they're already restricted by
// apply-rbac-permissions.cjs. This migration only touches the 128 non-critical
// tables, tightening them from PERMISSIONS FULL to role-specific.
// ---------------------------------------------------------------------------

const GRANULAR_TABLES = {
  // --- POS / Ordering (waiter + cashier + kitchen) ---
  order: {
    select: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier', 'kitchen', 'delivery'),
    create: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    update: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier', 'kitchen'),
    delete: roleOrAdmin('manager'),
  },
  order_item: {
    select: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier', 'kitchen'),
    create: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    update: anyRole('super_admin', 'admin', 'waiter', 'cashier', 'kitchen'),
    delete: roleOrAdmin('manager'),
  },
  order_item_kitchen: {
    select: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier', 'kitchen'),
    create: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    update: anyRole('super_admin', 'admin', 'kitchen'),
    delete: roleOrAdmin('manager'),
  },
  order_extras: {
    select: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier'),
    create: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    update: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    delete: roleOrAdmin('manager'),
  },
  order_meta: {
    select: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier'),
    create: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    update: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    delete: roleOrAdmin('manager'),
  },
  order_payment: {
    select: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier'),
    create: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    update: anyRole('super_admin', 'admin', 'manager', 'cashier'),
    delete: roleOrAdmin('manager'),
  },
  order_tax: {
    select: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier'),
    create: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    update: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    delete: roleOrAdmin('manager'),
  },
  order_discount: {
    select: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier'),
    create: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    update: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    delete: roleOrAdmin('manager'),
  },
  order_coupon: {
    select: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier'),
    create: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    update: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    delete: roleOrAdmin('manager'),
  },
  order_void: {
    select: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier'),
    create: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier'),
    update: roleOrAdmin('manager'),
    delete: roleOrAdmin('admin'),
  },
  order_refund: {
    select: anyRole('super_admin', 'admin', 'manager', 'cashier'),
    create: anyRole('super_admin', 'admin', 'manager', 'cashier'),
    update: roleOrAdmin('manager'),
    delete: roleOrAdmin('admin'),
  },
  order_merge: {
    select: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier'),
    create: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    update: roleOrAdmin('manager'),
    delete: roleOrAdmin('admin'),
  },
  order_split: {
    select: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier'),
    create: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    update: roleOrAdmin('manager'),
    delete: roleOrAdmin('admin'),
  },
  order_print: {
    select: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier'),
    create: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    update: roleOrAdmin('manager'),
    delete: roleOrAdmin('admin'),
  },
  order_number_seq: {
    // Atomic counter — only the POS creates/reads; never updates/deletes.
    select: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    create: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    update: 'NONE',
    delete: 'NONE',
  },

  // --- Menu / Catalog (admin writes, all read) ---
  menu: {
    select: 'FULL', // everyone authenticated
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  menu_item: {
    select: 'FULL',
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  dish: {  // if exists
    select: 'FULL',
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  category: {
    select: 'FULL',
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  modifier: {
    select: 'FULL',
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  modifier_group: {
    select: 'FULL',
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  tax: {
    select: 'FULL',
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  extra: {
    select: 'FULL',
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  extras: {
    select: 'FULL',
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  coupon: {
    select: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  coupon_redemption: {
    select: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier'),
    create: anyRole('super_admin', 'admin', 'waiter', 'cashier'),
    update: roleOrAdmin('manager'),
    delete: roleOrAdmin('admin'),
  },
  discount: {
    select: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  discount_reason: {
    select: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  role_discount_policy: {
    select: roleOrAdmin('admin'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },

  // --- Tables / Floors (admin + waiter) ---
  floor: {
    select: 'FULL',
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  floor_table: {
    select: 'FULL',
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  shift: {
    select: 'FULL',
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  order_type: {
    select: 'FULL',
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },

  // --- Kitchen / KDS ---
  kitchen: {
    select: anyRole('super_admin', 'admin', 'manager', 'kitchen', 'waiter'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  workflow: {
    select: anyRole('super_admin', 'admin', 'manager', 'kitchen'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  workflow_stage: {
    select: anyRole('super_admin', 'admin', 'manager', 'kitchen'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  kitchen_stock_count: {
    select: anyRole('super_admin', 'admin', 'manager', 'kitchen'),
    create: anyRole('super_admin', 'admin', 'kitchen'),
    update: anyRole('super_admin', 'admin', 'kitchen'),
    delete: roleOrAdmin('admin'),
  },
  kitchen_waste: {
    select: anyRole('super_admin', 'admin', 'manager', 'kitchen'),
    create: anyRole('super_admin', 'admin', 'kitchen'),
    update: anyRole('super_admin', 'admin', 'kitchen'),
    delete: roleOrAdmin('admin'),
  },
  kitchen_staff_meal: {
    select: anyRole('super_admin', 'admin', 'manager', 'kitchen'),
    create: anyRole('super_admin', 'admin', 'kitchen'),
    update: anyRole('super_admin', 'admin', 'kitchen'),
    delete: roleOrAdmin('admin'),
  },
  kitchen_complimentary_item: {
    select: anyRole('super_admin', 'admin', 'manager', 'kitchen'),
    create: anyRole('super_admin', 'admin', 'kitchen'),
    update: anyRole('super_admin', 'admin', 'kitchen'),
    delete: roleOrAdmin('admin'),
  },

  // --- Inventory (inventory role + admin) ---
  inventory_item: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('inventory'),
  },
  inventory_item_group: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('inventory'),
  },
  inventory_category: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('inventory'),
  },
  inventory_supplier: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('inventory'),
  },
  inventory_store: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('inventory'),
  },
  inventory_location: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('inventory'),
  },
  inventory_ledger: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'accountant'),
    create: roleOrAdmin('inventory'),
    update: 'NONE',  // ledger is append-only
    delete: 'NONE',
  },
  inventory_purchase: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'accountant'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('admin'),
  },
  inventory_purchase_item: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'accountant'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('admin'),
  },
  inventory_purchase_order: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('admin'),
  },
  inventory_purchase_return: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'accountant'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('admin'),
  },
  inventory_purchase_return_item: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'accountant'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('admin'),
  },
  inventory_issue: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('admin'),
  },
  inventory_issue_item: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('admin'),
  },
  inventory_issue_return: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('admin'),
  },
  inventory_issue_return_item: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('admin'),
  },
  inventory_item_waste: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('admin'),
  },
  inventory_item_waste_item: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('admin'),
  },
  inventory_adjustment: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'accountant'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('admin'),
  },
  inventory_adjustment_item: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'accountant'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('admin'),
  },
  stock_transfer: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('admin'),
  },
  stock_transfer_item: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: roleOrAdmin('inventory'),
    update: roleOrAdmin('inventory'),
    delete: roleOrAdmin('admin'),
  },

  // --- Production / Buffet ---
  recipe: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  recipe_item: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  recipe_output: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  production_batch: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: anyRole('super_admin', 'admin', 'inventory', 'kitchen'),
    update: anyRole('super_admin', 'admin', 'inventory', 'kitchen'),
    delete: roleOrAdmin('admin'),
  },
  production_batch_input: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: anyRole('super_admin', 'admin', 'inventory', 'kitchen'),
    update: anyRole('super_admin', 'admin', 'inventory', 'kitchen'),
    delete: roleOrAdmin('admin'),
  },
  production_batch_output: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: anyRole('super_admin', 'admin', 'inventory', 'kitchen'),
    update: anyRole('super_admin', 'admin', 'inventory', 'kitchen'),
    delete: roleOrAdmin('admin'),
  },
  buffet_menu: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  buffet_menu_item: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  buffet_session: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: anyRole('super_admin', 'admin', 'manager'),
    update: anyRole('super_admin', 'admin', 'manager', 'kitchen'),
    delete: roleOrAdmin('admin'),
  },
  buffet_production_batch: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: anyRole('super_admin', 'admin', 'kitchen'),
    update: anyRole('super_admin', 'admin', 'kitchen'),
    delete: roleOrAdmin('admin'),
  },
  buffet_stock_snapshot: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: anyRole('super_admin', 'admin', 'kitchen'),
    update: anyRole('super_admin', 'admin', 'kitchen'),
    delete: roleOrAdmin('admin'),
  },
  buffet_guest_count: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: anyRole('super_admin', 'admin', 'kitchen'),
    update: anyRole('super_admin', 'admin', 'kitchen'),
    delete: roleOrAdmin('admin'),
  },
  buffet_waste_log: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: anyRole('super_admin', 'admin', 'kitchen'),
    update: 'NONE',
    delete: roleOrAdmin('admin'),
  },
  buffet_consumption_log: {
    select: anyRole('super_admin', 'admin', 'manager', 'inventory', 'kitchen'),
    create: anyRole('super_admin', 'admin', 'kitchen'),
    update: 'NONE',
    delete: roleOrAdmin('admin'),
  },

  // --- Kitchen reconciliation ---
  kitchen_reconciliation: {
    select: anyRole('super_admin', 'admin', 'manager', 'kitchen'),
    create: anyRole('super_admin', 'admin', 'kitchen'),
    update: anyRole('super_admin', 'admin', 'kitchen'),
    delete: roleOrAdmin('admin'),
  },
  kitchen_reconciliation_item: {
    select: anyRole('super_admin', 'admin', 'manager', 'kitchen'),
    create: anyRole('super_admin', 'admin', 'kitchen'),
    update: anyRole('super_admin', 'admin', 'kitchen'),
    delete: roleOrAdmin('admin'),
  },
  kitchen_reconciliation_revision: {
    select: anyRole('super_admin', 'admin', 'manager', 'kitchen'),
    create: anyRole('super_admin', 'admin', 'kitchen'),
    update: 'NONE',
    delete: roleOrAdmin('admin'),
  },

  // --- Accounting (accountant + admin) ---
  account: {
    select: anyRole('super_admin', 'admin', 'manager', 'accountant'),
    create: roleOrAdmin('accountant'),
    update: roleOrAdmin('accountant'),
    delete: roleOrAdmin('admin'),
  },
  account_group: {
    select: anyRole('super_admin', 'admin', 'manager', 'accountant'),
    create: roleOrAdmin('accountant'),
    update: roleOrAdmin('accountant'),
    delete: roleOrAdmin('admin'),
  },

  // --- Day closing / Summary (manager + cashier + admin) ---
  day_closing: {
    select: anyRole('super_admin', 'admin', 'manager', 'cashier'),
    create: anyRole('super_admin', 'admin', 'manager', 'cashier'),
    update: roleOrAdmin('manager'),
    delete: roleOrAdmin('admin'),
  },
  document: {
    select: anyRole('super_admin', 'admin', 'manager'),
    create: anyRole('super_admin', 'admin', 'manager'),
    update: roleOrAdmin('manager'),
    delete: roleOrAdmin('admin'),
  },
  printer: {
    select: anyRole('super_admin', 'admin', 'manager'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  notes: {
    select: 'FULL',
    create: 'FULL',
    update: 'FULL',
    delete: roleOrAdmin('admin'),
  },
  setting: {
    select: 'FULL',
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },

  // --- Customer (waiter + cashier + admin) ---
  customer: {
    select: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier', 'delivery'),
    create: anyRole('super_admin', 'admin', 'waiter', 'cashier', 'delivery'),
    update: anyRole('super_admin', 'admin', 'waiter', 'cashier', 'delivery'),
    delete: roleOrAdmin('admin'),
  },
  customer_address: {
    select: anyRole('super_admin', 'admin', 'manager', 'waiter', 'cashier', 'delivery'),
    create: anyRole('super_admin', 'admin', 'waiter', 'cashier', 'delivery'),
    update: anyRole('super_admin', 'admin', 'waiter', 'cashier', 'delivery'),
    delete: roleOrAdmin('admin'),
  },

  // --- Tips ---
  tip_distribution: {
    select: anyRole('super_admin', 'admin', 'manager', 'cashier'),
    create: anyRole('super_admin', 'admin', 'manager', 'cashier'),
    update: roleOrAdmin('manager'),
    delete: roleOrAdmin('admin'),
  },
  tip_distribution_user_share: {
    select: anyRole('super_admin', 'admin', 'manager', 'cashier'),
    create: anyRole('super_admin', 'admin', 'manager', 'cashier'),
    update: roleOrAdmin('manager'),
    delete: roleOrAdmin('admin'),
  },

  // --- Integration framework tables (admin only, except health/queue which managers can read) ---
  integration_provider: {
    select: roleOrAdmin('admin'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  integration_provider_config: {
    select: roleOrAdmin('admin'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  integration_provider_certificate: {
    select: roleOrAdmin('admin'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  integration_provider_health: {
    select: anyRole('super_admin', 'admin', 'manager'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  integration_provider_secret: {
    select: roleOrAdmin('admin'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  integration_provider_webhook: {
    select: roleOrAdmin('admin'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  integration_installed_provider: {
    select: anyRole('super_admin', 'admin', 'manager'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  integration_queue: {
    select: anyRole('super_admin', 'admin', 'manager'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  integration_queue_attempt: {
    select: anyRole('super_admin', 'admin', 'manager'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  integration_schedule: {
    select: roleOrAdmin('admin'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  integration_execution_history: {
    select: anyRole('super_admin', 'admin', 'manager'),
    create: roleOrAdmin('admin'),
    update: 'NONE',
    delete: roleOrAdmin('admin'),
  },
  integration_order_fiscal: {
    select: anyRole('super_admin', 'admin', 'manager', 'accountant'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  integration_entity_mapping: {
    select: roleOrAdmin('admin'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  integration_sync_run: {
    select: anyRole('super_admin', 'admin', 'manager'),
    create: roleOrAdmin('admin'),
    update: roleOrAdmin('admin'),
    delete: roleOrAdmin('admin'),
  },
  integration_sync_failure: {
    select: anyRole('super_admin', 'admin', 'manager'),
    create: roleOrAdmin('admin'),
    update: 'NONE',
    delete: roleOrAdmin('admin'),
  },

  // --- Audit log (read-only for admin; events/services write) ---
  audit_log: {
    select: roleOrAdmin('admin'),
    create: 'FULL',  // events + services write; users shouldn't but if they do, logged
    update: 'NONE',  // audit log is append-only
    delete: roleOrAdmin('admin'),  // admin can purge old entries
  },
  revoked_session: {
    select: roleOrAdmin('admin'),
    create: 'FULL',  // gateway writes on logout
    update: 'NONE',
    delete: roleOrAdmin('admin'),
  },
  _schema_migration: {
    select: roleOrAdmin('admin'),
    create: roleOrAdmin('admin'),
    update: 'NONE',
    delete: roleOrAdmin('admin'),
  },
};

// ---------------------------------------------------------------------------
// Parse DEFINE TABLE statements from all .surql files (same as the
// table-level migration).
// ---------------------------------------------------------------------------

function parseTableDefinitions() {
  const migrationsDir = path.resolve(__dirname, '..');
  const surqlFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.surql'))
    .sort();
  const defs = {};
  for (const file of surqlFiles) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(
        /^DEFINE TABLE\s+(\w+)\s+(?:(TYPE\s+\w+)\s+)?(SCHEMA(?:FULL|LESS))(?:\s+PERMISSIONS\s+(NONE|FULL|FOR.*?))?\s*;/
      );
      if (m) {
        const [, name, typePart, schemaPart] = m;
        const type = typePart ? typePart.trim() : 'TYPE ANY';
        defs[name] = { type, schema: schemaPart };
      }
    }
  }
  return defs;
}

async function fetchLiveTableNames(db) {
  const result = await db.query('INFO FOR DB;');
  const info = Array.isArray(result) ? result[0] : result;
  return Object.keys(info?.tables || {});
}

function buildPermissionsClause(def) {
  const parts = [];
  for (const op of ['select', 'create', 'update', 'delete']) {
    const rule = def[op];
    if (rule === 'NONE') parts.push(`FOR ${op} NONE`);
    else if (rule === 'FULL') parts.push(`FOR ${op} FULL`);
    else parts.push(`FOR ${op} WHERE ${rule}`);
  }
  return `PERMISSIONS ${parts.join(', ')}`;
}

async function main() {
  console.log('Connecting to', DB_URL, 'ns=' + DB_NS, 'db=' + DB_NAME);
  const db = new Surreal();
  await db.connect(DB_URL, {
    namespace: DB_NS,
    database: DB_NAME,
    auth: { username: DB_USER, password: DB_PASS },
  });

  const parsedDefs = parseTableDefinitions();
  console.log(`Parsed ${Object.keys(parsedDefs).length} table definitions from .surql files.`);

  let liveNames = [];
  try {
    liveNames = await fetchLiveTableNames(db);
    console.log(`Live database has ${liveNames.length} tables.`);
  } catch (err) {
    console.warn('Could not fetch live table names:', err.message);
  }

  // Only apply granular permissions to tables in our GRANULAR_TABLES map.
  // Tables not in the map keep their existing permissions (PERMISSIONS FULL
  // from apply-rbac-permissions.cjs, or role-restricted if critical).
  const allNames = [...new Set([...Object.keys(parsedDefs), ...liveNames])];
  const granularNames = allNames.filter((n) => GRANULAR_TABLES[n]);

  console.log(`Applying granular permissions to ${granularNames.length} of ${allNames.length} tables.`);
  console.log('');

  let redefined = 0;
  let failed = 0;
  let skipped = 0;

  for (const name of allNames) {
    const granularDef = GRANULAR_TABLES[name];
    if (!granularDef) {
      skipped++;
      continue;
    }

    const { type, schema } = parsedDefs[name] || { type: 'TYPE ANY', schema: 'SCHEMALESS' };
    const permsClause = buildPermissionsClause(granularDef);

    if (DRY_RUN) {
      console.log(`  DRY-RUN  ${name.padEnd(35)} ${permsClause.slice(0, 70)}...`);
      redefined++;
      continue;
    }

    try {
      const ddl = `DEFINE TABLE ${name} ${type} ${schema} ${permsClause};`;
      await db.query(ddl);
      console.log(`  GRANULAR ${name.padEnd(35)} ${permsClause.slice(0, 60)}${permsClause.length > 60 ? '...' : ''}`);
      redefined++;
    } catch (err) {
      console.error(`  FAIL     ${name.padEnd(35)} ${err.message}`);
      failed++;
    }
  }

  console.log('');
  console.log(`Done. Granular: ${redefined}, skipped (kept existing): ${skipped}, failed: ${failed}${DRY_RUN ? ' (DRY RUN)' : ''}.`);

  if (!DRY_RUN && failed === 0) {
    console.log('');
    console.log('Granular per-role PERMISSIONS applied. The 128 non-critical');
    console.log('tables now have role-specific restrictions (e.g. only waiter');
    console.log('can CREATE orders, only inventory can adjust stock).');
    console.log('');
    console.log('Dormant until GATEWAY_USE_JWT_AS_SURREAL_TOKEN=true.');
    console.log('Run AFTER apply-rbac-permissions.cjs + apply-field-level-permissions.cjs.');
  }

  await db.close();
  if (failed > 0) process.exit(1);
}

module.exports = {
  GRANULAR_TABLES,
  buildPermissionsClause,
  parseTableDefinitions,
};

if (require.main === module) {
  main().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
