# Manual outage test script — PosStore (Dexie → outbox → SurrealDB)

Companion to [ADR 0001](0001-local-first-posstore.md). Run this on two
terminals (A = cashier, B = second cashier / KDS) whenever the sync path or a
PosStore command changes. Every step must succeed **with the gateway and/or
SurrealDB down**; the terminal must never show a Surreal error toast.

## Setup

1. Both terminals logged in, hydrated (`sync banner` hidden, no pending count).
2. Open DevTools → Application → IndexedDB → `posr-terminal-posstore` on terminal A so
   the outbox is visible (`syncOutbox`, `domainOperations`, `syncConflicts`).
3. Note the current max `invoice_number` and `auto_id` in Surreal:
   `SELECT math::max(invoice_number), math::max(auto_id) FROM order GROUP ALL;`

## Kill the backend

- Cloud: stop the gateway container (`docker stop posr-gateway`) **or** block
  its host in the browser (DevTools → Network → block request URL).
- On-prem: additionally stop SurrealDB (`systemctl stop surreal`).

The banner must switch to red "Offline" within a few seconds. Do **not**
reload the tab.

## Terminal A — full cashier cycle offline

| # | Action | Expect locally |
| --- | --- | --- |
| 1 | Floor → pick a free table, set covers = 3 | table shows occupied; `orders` store row `covers: 3`, outbox `MERGE_RECORD order` |
| 2 | Add 3 dishes (one with modifiers), **Send to kitchen** | new order with int `invoice_number`, items + `orderItemKitchens` rows, outbox `CREATE_RECORD order` + item merges; banner shows queued count |
| 3 | Re-open the order, append 2 more dishes | items appended, `order.items` grows, taxes recomputed (`orderTaxes` rows, `tax_amount`) |
| 4 | Change order type Take away → Dine in, then to kitchen | `order_type` changes locally and stays after a re-open |
| 5 | Void one line (qty 1 of 2) with a reason | qty decremented, `orderVoids` row, pending kitchen stage `cancelled`, `tax_amount` lowered |
| 6 | Move the order to another table | floor shows new table; old table free |
| 7 | Split by items into 2 checks | parent `Spilt`, two children with new int invoice numbers, items reassigned |
| 8 | Pay child 1 (cash + card, with a tip and one extra) | status `Paid`, `orderPayments` rows, `completed_at`, table released; outbox `CREATE_PAYMENT`×2, `MERGE_RECORD order`, `REPLACE_ORDER_RELATION` |
| 9 | Refund one item of child 1 (manager PIN) | `orderRefunds` row, item `is_refunded`, tags include `Refunded` |
| 10 | Merge child 2 into a brand new order from another table | sources `Merged`, target holds all items |
| 11 | Hold one dish, then **Fire** it | `is_suspended` false, kitchen rows created |
| 12 | Print a temp bill | print recorded in `orderPrints`; second attempt shows the "already printed" warning |
| 13 | Try to create 250 orders in a row (script or rapid fire) | after the reserved pool is exhausted the app shows the "numbers exhausted" toast and **refuses** to create — no string invoice numbers |

Check the banner counts the queued operations and that **no step** produced a
`syncConflicts` row.

## Terminal B — KDS offline

1. Open KDS. Orders fired before the outage are visible from Dexie.
2. Complete a stage, skip a stage, recall a completed stage.
3. Expect `orderItemKitchens` rows to change locally and `MERGE_RECORD
   order_item_kitchen` / `COMPLETE_KITCHEN_STAGE` ops in the outbox.

## Restore the backend

Start the gateway / SurrealDB again (or unblock the URL). Within one sync
interval (or after pressing **Sync now**):

- Banner turns green "Connection restored", queued count drops to 0.
- `syncOutbox` rows are `accepted`; `syncConflicts` is empty.
- In Surreal, for each order touched above:

```surql
SELECT id, status, invoice_number, auto_id, covers, order_type, table,
       tax_amount, payments, order_taxes, extras, owner_terminal_id, server_version
FROM order WHERE created_at > time::now() - 2h
FETCH payments, order_taxes, extras;
SELECT * FROM order_void, order_refund, order_split, order_merge, order_print
WHERE created_at > time::now() - 2h;
SELECT id, status, sequence FROM order_item_kitchen
WHERE created_at > time::now() - 2h ORDER BY sequence;
```

  Every value must equal the Dexie rows on terminal A / B. `invoice_number`
  and `auto_id` are ints, unique, and above the pre-outage max noted in setup.

- Terminal B (cashier view) receives all of A's orders via pull without a
  reload: floor shows the paid table free, the split children and the merged
  order.

## Conflict path

1. On terminal A open an order; on terminal B force **Take over** the same
   order and change covers while A is offline.
2. Reconnect A and change covers there too. A's push must be rejected
   (`VERSION_CONFLICT` or `NOT_OWNER`); the banner turns red "1 change
   rejected", **View** lists the order with Retry / Discard.
3. **Discard** → conflict disappears, outbox row is `discarded`, the domain
   operation stays in `domainOperations` for audit.
4. Repeat and choose **Retry** → op is re-queued and pushed; result depends on
   the current owner (may conflict again — expected).

## Backoff path

With the gateway blocked but the browser online (URL block), watch
`syncOutbox.nextAttemptAt` grow 2 s → 4 s → 8 s … up to 5 min and `attempts`
increment; after 8 attempts `status` is `failed` and the banner says the
changes could not reach the server. Pressing **Sync now** or unblocking the
URL pushes immediately regardless of `nextAttemptAt`.

## Regression guard

`bun x vitest run src/infrastructure` runs the PosStore command tests and the
FOH write guard; `node --test gateway/src/sync-store.test.cjs` covers the
gateway operation semantics.
