-- Cloud / HQ schema for per-branch catalog field overrides (Phase 4).
-- Run on the shared master SurrealDB. Branch terminals do not store these rows;
-- sync-service merges patches into flat local catalog rows on download.

DEFINE TABLE IF NOT EXISTS catalog_branch_override SCHEMALESS PERMISSIONS NONE;
DEFINE FIELD IF NOT EXISTS table ON catalog_branch_override TYPE string PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS base_id ON catalog_branch_override TYPE string PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS branch_id ON catalog_branch_override TYPE string PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS patch ON catalog_branch_override TYPE any PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS updated_at ON catalog_branch_override TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS updated_by ON catalog_branch_override TYPE option<string> PERMISSIONS FULL;
DEFINE INDEX IF NOT EXISTS catalog_branch_override_lookup
  ON catalog_branch_override FIELDS table, base_id, branch_id UNIQUE;
DEFINE INDEX IF NOT EXISTS catalog_branch_override_branch
  ON catalog_branch_override FIELDS branch_id;

ALTER TABLE IF EXISTS catalog_branch_override CHANGEFEED 14d;
