-- Phase 2: cloud → local catalog download cursors (never uploaded to master).
-- Also used for applied catalog_release version meta (`sync_catalog_down_cursor:_meta`).

DEFINE TABLE IF NOT EXISTS sync_catalog_down_cursor SCHEMALESS PERMISSIONS NONE;
