# QR Table Ordering

## Purpose

Let guests order and pay from their own phone. Each table gets its own QR code; scanning it opens that table's menu. When the payment succeeds, the order is sent to the POS as a paid **Dine In** check and appears on the kitchen display straight away — no cashier needed. Guests can still order at the counter as usual.

## Features

- **One QR code per table** — generated automatically for every table; printable A4 sheet (2 per row)
- **Phone menu** — categories, search, dish options (sizes, add-ons) with required choices enforced, special requests
- **Online payment** — Stripe (cards, wallets, 3-D Secure) and PayPal, using the payment types configured under Manage → Payment types
- **Same prices and taxes as the till** — the server recalculates every order from the menu (active menu prices, per-menu option prices, inclusive/exclusive taxes); the phone never decides the price
- **Straight to the kitchen** — the paid order is written through the terminal sync protocol, so it gets a normal invoice number, kitchen routing (workflows / kitchens) and shows on every terminal
- **Test payments** — try the whole flow without charging a card (orders are tagged `Test Payment`)
- **Per-table on/off and new code** — switch a table's code off, or make a new code if a printed one should stop working

## Setup

1. Manage → **QR Ordering**
2. Choose the **order type** for QR orders (usually *Dine In*)
3. Under **Online payment methods**, pick your Stripe / PayPal payment type
   - None listed? Create one first under Manage → Payment types (Remote, gateway Stripe or PayPal, with keys)
4. Check the **address customers' phones use** — it must be reachable from a phone (this computer's network address such as `http://192.168.x.x:5173`, or your public domain). `localhost` will not work.
5. Turn QR ordering **On** and **Save settings**
6. Tick the tables, click **Print QR codes**, and stick each code on its table

## Guest workflow

1. Scan the code on the table
2. Browse the menu, add dishes (pick options where required)
3. Review the order, optionally add a name and a note for the kitchen
4. Pay by card / PayPal
5. See the order number — the kitchen already has it

## Where QR orders show up in the POS

- **Kitchen** — immediately, like any fired order, with the table (e.g. `G5`), order number, options and notes
- **Orders** — status *Paid* (select *Paid* in the status filter; the default view only lists open checks)
- **Reports** — like any other paid sale; tags `QR Order` (and `Test Payment` for test orders)

## Business Rules

- The order reaches the POS **only after the payment is confirmed** with the payment provider
- Prices, taxes and options are always re-checked on the server; items that are no longer on the active menu are rejected
- Categories that only contain option dishes (e.g. extra toppings) are hidden from guests by default; change this under *Categories hidden from customers*
- Unpaid checkouts expire after one hour
- If a payment succeeds but the POS cannot be reached, the guest sees a message to show staff, and the order is listed under **Paid QR orders that did not reach the POS** with a **Send to POS again** button
- Turn **Test payments off** before real guests use it

## Technical notes

- Customer page: `order.html` (`src/self-order/`)
- API: gateway `/self-order/*` (`gateway/src/self-order/`), proxied on the web origin (Vite dev proxy / `nginx.conf`)
- Data: `setting:self_order` (settings), `self_order_table` (QR tokens), `self_order_checkout` (checkouts); orders are pushed as the virtual terminal `self-order`
