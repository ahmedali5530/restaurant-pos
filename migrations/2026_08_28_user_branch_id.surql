-- Migration: 2026_08_28_user_branch_id.surql
--
-- Adds a `branch_id` field to the user table to support per-user row-level
-- restrictions in SurrealDB PERMISSIONS.
--
-- A user's branch_id links them to their "home" inventory_store (a physical
-- restaurant location). When set, the JWT carries branch_id as a claim, and
-- SurrealDB PERMISSIONS can filter rows by:
--   WHERE branch_id = $auth.branch_id OR $auth.roles CONTAINS 'super_admin'
--
-- This enables multi-branch restaurant chains to isolate data per location —
-- a waiter at Branch A cannot see orders from Branch B.
--
-- branch_id is OPTIONAL (option<record<inventory_store>> | null). Users
-- without a branch_id (e.g. super admins, area managers) see all branches.
-- This preserves backward compatibility — existing users continue working.
--
-- See: RBAC-DESIGN.md → "Per-user row-level restrictions" section
-- See: migrations/scripts/apply-row-level-permissions.cjs (the PERMISSIONS)
-- See: gateway/src/auth.service.js (reads branch_id for JWT claim)
-- See: gateway/src/jwt.js (adds branch_id to JWT payload)

-- Add branch_id field to user table.
DEFINE FIELD IF NOT EXISTS branch_id ON user
  TYPE option<record<inventory_store>>
  PERMISSIONS
    FOR select FULL,
    FOR create WHERE $auth.roles CONTAINS 'super_admin' OR $auth.roles CONTAINS 'admin',
    FOR update WHERE $auth.roles CONTAINS 'super_admin' OR $auth.roles CONTAINS 'admin',
    FOR delete NONE;

-- Index for querying users by branch (admin UI lists users per branch).
DEFINE INDEX IF NOT EXISTS user_branch_id ON user FIELDS branch_id;

-- Add branch_id field to order table — records which branch an order belongs to.
-- This is separate from the existing floor/table which is physical; branch_id
-- is logical (which restaurant location this order belongs to).
DEFINE FIELD IF NOT EXISTS branch_id ON order
  TYPE option<record<inventory_store>>
  PERMISSIONS
    FOR select FULL,
    FOR create FULL,
    FOR update FULL,
    FOR delete NONE;

DEFINE INDEX IF NOT EXISTS order_branch_id ON order FIELDS branch_id;

-- Add branch_id to order_item_kitchen — kitchen orders are branch-specific.
DEFINE FIELD IF NOT EXISTS branch_id ON order_item_kitchen
  TYPE option<record<inventory_store>>
  PERMISSIONS
    FOR select FULL,
    FOR create FULL,
    FOR update FULL,
    FOR delete NONE;

DEFINE INDEX IF NOT EXISTS order_item_kitchen_branch_id ON order_item_kitchen FIELDS branch_id;

-- Add branch_id to day_closing — each branch closes separately.
DEFINE FIELD IF NOT EXISTS branch_id ON day_closing
  TYPE option<record<inventory_store>>
  PERMISSIONS
    FOR select FULL,
    FOR create FULL,
    FOR update FULL,
    FOR delete NONE;

DEFINE INDEX IF NOT EXISTS day_closing_branch_id ON day_closing FIELDS branch_id;
