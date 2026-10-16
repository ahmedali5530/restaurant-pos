# ADR 0001: Local-first FOH via PosStore (Dexie), Surreal as master

## Status

Accepted — 2026-09-04  
Amended **v1.1** — 2026-09-19 (gateway-assigned invoice numbers)  
Amended **v1.2** — 2026-09-19 (configurable number policies)

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

### v1.1 — Gateway-assigned invoice numbers (2026-09-19)

Pre-reserved invoice blocks cannot be fiscal-safe across tills: each terminal’s
pool is a disjoint range, so the next sale on till B jumps (1, then 201).
Fiscal authorities reject those holes. Dual “working vs fiscal” sequences were
rejected as an evasion foot-gun.

**Invoice numbers are minted only on the gateway**, on a shared day-scoped
counter, at `CREATE_RECORD` for `order`. Every till shares one restaurant-wide
sequence that restarts at 1 each business day.

- The terminal creates (and splits/merges) checks **without** `invoice_number`.
  Floor, kitchen, and cart show a Dexie-only 6-character code (e.g. `ABC123`)
  until push returns `assignments`. The code is stripped before Surreal and is
  never sent to fiscal. Assignments are applied **before** the outbox row is
  marked accepted. A retried CREATE returns the already-assigned number.
- Local `auto_id` (and receipt) still use reserved pools. Invoice refill no
  longer runs. `NUMBERS_EXHAUSTED` applies to those leftover pools, not to
  creating a check.
- Fiscal submit **waits** until the gateway number exists and uses that same
  integer. Auto-close skips checks still waiting for a number.
- Open Dexie shells with no invoice, owner, or items are still pruned; owned
  local creates waiting for a number are not ghosts.

### v1.2 — Configurable number policies (2026-09-19)

Restaurants configure invoice minting via a global `setting` key
`number_policy` (Settings → Invoice numbers). One engine covers scope, reset,
format, mint, and pending labels — presets are saved combinations, not separate
allocators.

- **Default** remains Date Reset: `mint: gateway`, `reset: day`,
  `scope: restaurant`, `template: "{seq}"`, pending random 6-char code,
  `fiscal: same_int`.
- Gateway loads the policy from Surreal (not client-spoofable ints), keys
  `sync_number_counter` by scope + reset window, and snapshots
  `invoice_display` (+ optional `invoice_prefix`) at mint so later policy edits
  do not rewrite old checks. `invoice_number` stays `int` for fiscal / sort.
- Tokens: `{seq}`, `{prefix}`, `{suffix}`, `{yyyy}`, `{mm}`, `{dd}`,
  `{branch}`, `{terminal}`. Branch code is a policy string until a real org
  model exists; each till has an editable `terminalCode` on Dexie identity.
- **Unsafe presets** (terminal sequential, pool, hybrid) require
  `acknowledgeGaps` and are documented as fiscal-gap risks. Pool/hybrid re-enable
  local invoice refill; hybrid online still gateway-overwrites to reduce holes.
- Fiscal provider numbers stay on `integration_order_fiscal` — POSR does not
  mint `FBR-…` strings. Provider-defined is documented storage, not a minter.

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
- **Numbers (v1.0)**: invoice / auto ids were ints from reserved ranges
  (blocks of 200, refilled at 50 %). Creating a check with an exhausted pool
  failed with `NUMBERS_EXHAUSTED` instead of emitting provisional strings.
  **Superseded by v1.1 / v1.2** — default invoices are gateway-assigned at CREATE
  with a snapshotted `invoice_display`; restaurant policies can re-enable local
  invoice pools (terminal/hybrid) with explicit gap acknowledgement. `auto_id`
  still uses local reserved pools.
- **Side effects** (fiscal, accounting publish, tracking, print recording) run
  after the local commit and never block or roll back the mutation.
- **Robustness**: outbox transport failures back off exponentially and are
  surfaced as `failed`; gateway rejections are surfaced per order in the sync
  banner with retry / discard. A vitest guard
  (`src/infrastructure/pos-store/foh-write-guard.test.ts`) fails the build when
  a direct `db.merge/create/delete/insert/update` reappears in FOH code.
- Offline settlement is allowed; receipts, fiscal and accounting exports catch
  up when connectivity returns.
