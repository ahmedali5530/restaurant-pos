# Terminal sync protocol v1 (PosStore / Dexie clients)

All `/sync` endpoints require the gateway session bearer token. JSON responses
contain `ok` and `protocolVersion`. Local storage is **Dexie PosStore** — not
Surreal WASM. SurrealDB remains the master.

## Transport

- `POST /sync/handshake` — negotiate versions and register the terminal
- `POST /sync/snapshot` — hydrate catalog (+ optional catch-up events)
- `POST /sync/reserve-numbers` — invoice/receipt ranges
- `POST /sync/push` — ordered, idempotent terminal operations
- `GET /sync/pull` — accepted events after cursor

LIVE on `sync_event` is a wake-up only; clients must not apply LIVE payloads as
state. Push-then-pull is authoritative.

## Ownership

**Offline isolation (client):** while a terminal is not effectively connected,
cashier mutations require local `order.owner_terminal_id` to match (or be empty
to claim). Cross-terminal edits throw `NOT_OWNER` until steal/release.

**Online / gateway:** any terminal may push cashier ops. The gateway does **not**
reject with `NOT_OWNER`. On accept, order MERGEs without an explicit
`owner_terminal_id` in the payload transfer ownership to the pushing terminal.
`COMPLETE_KITCHEN_STAGE` does not require ownership. `STEAL_ORDER` is allowed
when the owner heartbeat is stale (or with `force`). `CLAIM_ORDER` /
`RELEASE_ORDER` remain explicit handoff ops.

## Financial rules

Payment/refund/void creation is accepted only as new immutable events.
Merge/patch/delete against financial rows returns `FINANCIAL_OPERATION_IMMUTABLE`.

## Operation types

Every operation carries `operationId`, `terminalId`, `sequence` (strictly
increasing within a push batch), `aggregateType`, `aggregateId`,
`operationType`, `expectedVersion` and a `payload` with at least `table` and
`recordId`. Replays of an already accepted `operationId` are acknowledged
without re-applying.

| Type | Payload | Notes |
| --- | --- | --- |
| `CREATE_RECORD` | `{table, recordId, data, orderId?, linkRelation?, linkField?}` | Generic upsert for any table. For child tables (`order_void`, `order_refund`, `order_tax`, `order_discount`, `order_coupon`, `coupon_redemption`, `order_split`, `order_merge`, `order_print`, `customer`, `floor_table`) record-link fields are coerced via `RECORD_LINK_FIELDS`. `linkRelation` (`payments`, `order_taxes`, `order_discounts`, `extras`) unions the new id into the parent order array; `linkField` (`coupon`, `customer`, `discount`) sets a single link. |
| `MERGE_RECORD` | `{table, recordId, data, orderId?, kitchens?, replaceItems?}` | Allowed on `order`, `order_item` (`order`, `seat`, `is_suspended`, `is_refunded`, `quantity`, `deleted_at`, workflow fields), `order_item_kitchen` (stage status) and `floor_table` (only `is_locked`, `locked_by`, `locked_at`). `kitchens[]` pre-creates stage rows when firing. `replaceItems[]` rewrites `order.items` (split / merge). `LOCAL_ONLY_FIELDS` (e.g. `order.draft_payments`) are stripped. |
| `CREATE_PAYMENT` | `{table:'order_payment', recordId, orderId, data}` | Upserts the immutable payment row, then `array::union`s its id into `order.payments`. Owner-gated. |
| `REPLACE_ORDER_RELATION` | `{recordId, relation, childTable, rows[], data?}` | Upserts `rows` (deterministic ids), deletes rows of `childTable` for that order not in the set, sets `order.<relation>` and merges `data` (e.g. `tax_amount`, `status`). `relation ∈ payments, order_taxes, order_discounts, extras`. |
| `CLAIM_ORDER` / `RELEASE_ORDER` / `STEAL_ORDER` | `{recordId, force?}` | Ownership transitions. `STEAL_ORDER` returns `OWNER_FRESH` while the current owner heartbeat is younger than 45 s unless `force`. |
| `COMPLETE_KITCHEN_STAGE` | `{recordId, nextPendingId?}` | Not owner-gated. |

### Concurrency

`MERGE_RECORD`, `REPLACE_ORDER_RELATION`, and `CREATE_PAYMENT` on an `order`
aggregate carry the client's `expectedVersion`. A behind `expectedVersion`
fast-forwards — `server_version` becomes `max(current, expected) + 1`. That
avoids false conflicts when earlier outbox ops advanced the server while a
later/retried op still carried an older number. Cross-terminal online edits
are accepted and transfer ownership to the pushing terminal.

Conflict codes: `OWNER_FRESH`, `NOT_FOUND`,
`FINANCIAL_OPERATION_IMMUTABLE`, `SEQUENCE_GAP`, `UNSUPPORTED_OPERATION`,
`APPLY_ERROR` (legacy clients may still surface historical `NOT_OWNER` rows).
Conflicted ops are persisted in `sync_conflict`; the terminal keeps them in its
outbox as `conflict` until the operator retries or discards them.

### Client outbox retry policy

Transport failures (gateway unreachable, 5xx) never drop operations. The client
increments `attempts`, applies exponential backoff (2 s doubling, capped at
5 min, evaluated over the whole outbox so ops stay ordered) and flags rows
`failed` after 8 attempts while still retrying. A reconnect or "Sync now"
bypasses the backoff.

## Snapshot

`SNAPSHOT_TABLES` covers the catalog plus operational tables. Operational
tables are filtered to keep hydration bounded: orders that are `In Progress`
or created in the last 3 days (`order`, `order_item`, `order_item_kitchen`).
`order` rows are returned with `FETCH payments, order_taxes, order_discounts,
extras, coupon`; the client expands them into child stores. Trailing events up
to the snapshot watermark are **not** replayed — records are the truth at
snapshot time and pull continues from the watermark.
