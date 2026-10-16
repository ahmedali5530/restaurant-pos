# ADR 0002: Local-to-cloud FOH upload via Surreal changefeed

## Status

Accepted — 2026-09-24

## Context

ADR 0001 covers **terminal → branch Surreal**: Dexie PosStore, gateway outbox,
push/pull. That keeps a single store online for cashiers.

A second hop is required for **multi-branch / franchise** distribution:

- Each branch runs its own Surreal (source of truth for that site).
- A shared **cloud master** holds reporting and HQ views for many branches.
- Phase 1 uploads **FOH / sales** data local → cloud. Phase 2 (later) will
  download **BOH** data cloud → local. This ADR is phase 1 only.

The previous `sync-service` used `LIVE SELECT` on every table and upserted to
master. That path:

1. Dropped events when master was unreachable or the process was down.
2. Never uploaded rows written while the service was stopped.
3. Timed out master writes and discarded them (no durable retry).
4. Had no tenant stamp, so multiple branches could not share one master safely.

Product requirements: uploads must survive offline master, process restarts,
and outages up to the changefeed retention window; catch up historical FOH
rows on first connect; stamp every cloud row with a branch id; do not upload
menu, inventory, accounts, or other BOH tables in this phase.

## Decision

1. **Keep a separate Node `sync-service`** next to the branch stack
   (`sync-service/`). Do not fold this into the browser PosStore or gateway
   terminal protocol.
2. **Capture = SurrealDB changefeed**, not LIVE. Each FOH table gets
   `ALTER TABLE … CHANGEFEED 14d`. The service polls
   `SHOW CHANGES FOR TABLE … SINCE <cursor>` and advances the cursor only
   after master acknowledges the write.
3. **Reconcile = paged `SELECT` backfill** when there is no cursor, or when
   the cursor falls outside retention. Upsert-by-id makes overlap with the
   feed safe.
4. **Allowlist only FOH / sales tables** (orders and children, payments,
   fiscal junction, closings, shifts, tips, customers, …). Configurable via
   `SYNC_INCLUDE_TABLES` / `SYNC_EXCLUDE_TABLES`. Catalog, inventory,
   accounts, staff setup, settings, `sync_*`, and credentials stay local.
5. **`branch_id` is injected on the master payload only** from
   `SYNC_CLIENT_ID`. It is not written onto local POS tables. Master gets
   `DEFINE FIELD IF NOT EXISTS branch_id` for allowlisted tables.
6. **Retries are unbounded at the table level.** Each master write has a
   short in-process retry (default 5); on failure the cursor stays put and
   the table backs off (1s … 5 min). Health checks and connects use hard
   timeouts so a dead master cannot hang the poll loop forever.
7. **`SHOW CHANGES … SINCE` is treated as inclusive.** Entries at or before
   the stored cursor are ignored so the last stamp is not replayed forever.
8. **Array-linked children** (e.g. `order.items`) are materialized only when
   the child table is on the allowlist. Links to `user` / menu / etc. are
   left as references and are not upserted to master.
9. **Observability** via `GET /health` and `GET /stats` (`lastSynced`,
   `syncing`, per-table cursor / backfill / blocked, `eventsProcessed` /
   `eventsFailed`). `eventsFailed` counts attempts, not permanently lost
   rows.

Schema lives in `migrations/2026_09_24_foh_changefeed.surql` (+ fiscal
follow-up) and `run-prod-migrations.cjs`. Implementation lives in
`sync-service/src/sync-manager.js` and helpers.

### Out of scope (later ADR)

- Cloud → local BOH download (menu, inventory, shared config).
- Conflict resolution when the same BOH row is edited in cloud and branch.
- Third-party CDC (Debezium / Airbyte) — Surreal is not a supported source.

## Consequences

- Branch reporting on cloud depends on `sync-service` running and
  `SYNC_MASTER_*` + unique `SYNC_CLIENT_ID` per store.
- Outages longer than **14 days** lose changefeed history; the service
  re-backfills **current** row state (not every intermediate version).
  Raise retention in the migration if stores can be offline longer.
- Deletes of rows that never reached master and whose delete aged out of
  the feed may leave orphans only in edge cases; normal create→upload→delete
  within retention is fine.
- Direct edits on master are overwritten by the next source upsert for that
  id; treat master as read-mostly for uploaded FOH tables.
- Terminal offline sync (ADR 0001) and this upload are independent: Dexie can
  be healthy while cloud upload is blocked, and vice versa.
- Operators verify catch-up with `/stats` and by checking master rows for
  `branch_id`, not by watching LIVE logs.

### Operational notes

- Apply FOH changefeed migrations on the **source** (branch) database before
  relying on the feed.
- Smoke: `sync-service/scripts/smoke-changefeed.cjs` (backfill + live create).
- Stopping master must surface `connectedMaster: false` / `lastError` and
  keep retrying; pending feed entries are not dropped.
