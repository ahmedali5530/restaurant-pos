-- Cloud / HQ schema for catalog publish (Phase 3).
-- Run on the shared master SurrealDB used by SYNC_MASTER_*.
-- Branch terminals do not need this for Sync now; HQ Publish UI does.

DEFINE TABLE IF NOT EXISTS sync_branch SCHEMALESS PERMISSIONS NONE;
DEFINE FIELD IF NOT EXISTS client_id ON sync_branch TYPE string PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS name ON sync_branch TYPE string PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS active ON sync_branch TYPE bool DEFAULT true PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS created_at ON sync_branch TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS updated_at ON sync_branch TYPE option<datetime> PERMISSIONS FULL;
DEFINE INDEX IF NOT EXISTS sync_branch_client_id ON sync_branch FIELDS client_id UNIQUE;

-- Release nudge records read by sync-service catalog download (max of global + branch).
DEFINE TABLE IF NOT EXISTS catalog_release SCHEMALESS PERMISSIONS NONE;
DEFINE FIELD IF NOT EXISTS version ON catalog_release TYPE int PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS note ON catalog_release TYPE option<string> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS published_at ON catalog_release TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS published_by ON catalog_release TYPE option<string> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS tables ON catalog_release TYPE option<array<string>> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS audience ON catalog_release TYPE option<string> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS branch_ids ON catalog_release TYPE option<array<string>> PERMISSIONS FULL;
