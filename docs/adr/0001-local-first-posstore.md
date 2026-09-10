# ADR 0001: Local-first FOH via PosStore (Dexie), Surreal as master

## Status

Accepted — 2026-09-04

## Context

Three offline attempts failed or were incomplete:

1. **Write queue** — CRUD replay to Surreal when reconnecting; no readable local replica; last-write-wins.
2. **Operational store** — idb-keyval document blobs; FETCH races; temp IDs.
3. **Surreal WASM** — recursive aliasing, SCHEMAFULL hangs, nested exclusive locks, FETCH fragility.

Product requirements: FOH must work when the network or Surreal is down; sync to master on restore; same write path online and offline; **owner-terminal lock applies only while offline** so disconnected terminals cannot diverge on the same check. Online, any terminal may mutate and ownership transfers to the pusher.

## Decision

1. **Local engine = Dexie (IndexedDB)** behind a `PosStore` interface. No Surreal WASM in the browser.
2. **Remote Surreal** remains the system of record. The gateway exposes handshake, snapshot, reserve-numbers, push, and pull.
3. **Every FOH mutation** commits locally first (projection + outbox) in one Dexie transaction, then sync drains the outbox. Online is not a faster special path.
4. **Same architecture for cloud and on-prem.** LAN Surreal only shortens sync latency.
5. **Owner-terminal lock (offline isolation)** on each order (`owner_terminal_id` + heartbeat). While effectively connected, cashier mutations auto-take ownership and the gateway does not reject with `NOT_OWNER`. Offline, non-owner cashier ops throw/reject `NOT_OWNER` until steal/release. Kitchen stage bumps do not require ownership.
6. Application screens never choose a database based on connectivity or deployment mode (ownership gating is the only connectivity-aware exception).

### 2026-09-08 — offline-only ownership

Hard cross-terminal locks were incorrectly applied online. Ownership is now an offline isolation mechanism; online multi-terminal edits are allowed and transfer `owner_terminal_id` to the pushing terminal.

## Consequences

- FOH screens talk only to `PosStore` (commands + queries).
- `useDB` / Surreal WebSocket remain for login, BOH, and the sync worker’s gateway calls — not for order writes.
- The legacy offline write-queue is retired.
- Storage can later move to SQLite/OPFS behind the same `PosStore` interface.

### 2026-09-07 — every order operation on the PosStore path

The audit of the first cut found ~40 FOH sites still writing Surreal directly
(pay, void, refund, split, merge, covers, table move, table lock, fire, KDS,
taxes, discounts, coupons, extras, auto-close) plus "Surreal-first + Dexie
mirror" helpers. All of them now go through `PosStore` commands:

- **Commands**: `voidOrderItems`, `recomputeOrderTaxes`, `replaceOrderRelation`,
  `saveOrderDraft`, `settleOrder`, `setOrderStatus`, `refundOrder`,
  `splitOrder`, `mergeOrders`, `fireOrderItems`, `updateKitchenStage`,
  `skipKitchenStage`, `recallKitchenStage`, `cancelItemKitchenStages`,
  `lockTable` / `unlockTable` / `heartbeatTableLock`, `createCustomer`,
  `recordOrderPrint`. Each is one Dexie transaction (projection + domain
  operation + outbox row) followed by a `posr-posstore-write` event.
- **Dexie v2** stores every order child relation (payments, voids, refunds,
  taxes, discounts, coupons, extras, redemptions, splits, merges, prints),
  customers and table locks, so reads (floor, orders, order card, payment
  screen) hydrate entirely from Dexie. Surreal `LIVE` is only a sync wake-up.
- **Protocol**: `CREATE_PAYMENT`, `REPLACE_ORDER_RELATION`, `MERGE_RECORD` on
  `order_item` / `order_item_kitchen` / `floor_table`, `CREATE_RECORD` with
  parent linking, `expectedVersion` → `VERSION_CONFLICT`, server-side steal
  staleness check. See `gateway/src/sync-protocol.md`.
- **Numbers**: invoice / auto ids are only ever ints from reserved ranges
  (blocks of 200, refilled at 50 %). Creating a check with an exhausted pool
  fails with `NUMBERS_EXHAUSTED` instead of emitting provisional strings.
- **Side effects** (fiscal, accounting publish, tracking, print recording) run
  after the local commit and never block or roll back the mutation.
- **Robustness**: outbox transport failures back off exponentially and are
  surfaced as `failed`; gateway rejections are surfaced per order in the sync
  banner with retry / discard. A vitest guard
  (`src/infrastructure/pos-store/foh-write-guard.test.ts`) fails the build when
  a direct `db.merge/create/delete/insert/update` reappears in FOH code.
- Offline settlement is allowed; receipts, fiscal and accounting exports catch
  up when connectivity returns.
