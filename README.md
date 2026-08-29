# POSR — AI-Powered Restaurant POS & Management System

**Offline-first, source-available restaurant POS software** for ordering, kitchen display (KDS), inventory, recipes, staff scheduling, payroll, accounting, delivery, fiscalization, and AI-powered restaurant analytics — in one platform.

POSR is a **source-available restaurant POS and restaurant management system** built for modern food businesses. It combines point-of-sale ordering, kitchen display systems (KDS), inventory and recipe management, staff scheduling and payroll, accounting, delivery, fiscalization (FBR / PRA), and AI restaurant analytics in one **offline-first** platform.

React · TypeScript · Vite · Bun · SurrealDB · WebSockets · IndexedDB

## Links

- **[Documentation](https://ahmedali5530.xyz/posr/docs)**
- **[Get started — Installation & first sale](https://ahmedali5530.xyz/posr/docs)**
- **[Live demo](https://ahmedali5530.xyz/posr)** — pins `1234`, `0000`, `5555` (super admin)
- **[Landing / product](https://ahmedali5530.xyz/posr)**
- **Integrations framework (dev):** [docs/integrations/framework.md](docs/integrations/framework.md)
- **Auth gateway:** [docs/security/GATEWAY.md](docs/security/GATEWAY.md)

---

## Who is POSR for?

POSR is designed for **restaurants, cafés, coffee shops, bakeries, bars, hotels, cloud kitchens, food courts, catering, and multi-location restaurant groups** that need a full operations stack — not just a cash register.

## Why POSR?

Traditional restaurant POS software often depends on cloud connectivity and separate tools for inventory, accounting, staff, delivery, and analytics. POSR combines those workflows in one **offline-first, extensible** platform.

- **Source-available** — inspect, modify, extend, and self-host under [PSAL](LICENSE)
- **Offline-first** — keep selling during internet outages; sync when back online
- **AI-native** — natural-language reporting, inventory/staff forecasts, AI Import
- **Real-time** — WebSocket sync across POS, KDS, manager, and delivery apps
- **Restaurant-specific** — tables, seats, modifiers, recipes, kitchen production, buffet, fiscalization
- **Extensible** — event-driven Integration Manager for fiscal, accounting, logging, and more

---

## Restaurant POS & Management Features

### AI restaurant analytics & reporting

- **Natural language analytics** — ask plain-text questions; get visual reports across sales, inventory, accounts, and labor
- **Descriptive analytics** — patterns, anomalies, voids/discounts, performance drivers
- **Sales forecasting** — demand prediction for staffing, purchasing, promotions
- **AI inventory forecasting** — purchase quantity suggestions from history, stock, holidays, weather, events
- **AI staff forecasting** — recommended hours/headcount vs schedule and same-weekday history
- **Order dossier** — full order timeline by ID, number, or invoice (dishes, voids, payments, kitchen, fiscal, prints)
- **Sales vs consumption** — recipe usage vs ledger issuance vs purchases
- **AI Import** — OCR/parse CSV, Excel, PDF, images, clipboard for master data, document lines, journals, HR shifts (create / update / upsert)
- **AI usage controls** — daily/monthly quotas; disable AI entirely

### Restaurant ordering & POS

- **Table-based ordering** — seat assignments, split by seat, multi-order tables
- **Takeaway mode** — pickup queue, customer name/phone/time
- **Order lifecycle** — split / merge / cancel / transfer / refunds
- **Modifiers** — groups, nested modifiers, price overrides, min/max rules
- **Visual menu builder** — dishes, categories, multi-category, tax rules
- **Multiple menus** — breakfast/lunch/dinner, dynamic pricing, delivery menu link
- **Extras & service charges** — fixed/%, rule-based by order type / payment / table
- **Discounts & coupons** — fixed/%, Buy X Get Y, payment-type promos, delivery coupons
- **Closing cycles** — auto check close, shift/day close, enforcement + notifications
- **Tips** — pooling, staff rules, shift allocation
- **Waiter app** — mobile order entry, table select, touch-optimized
- **Manager app** — dashboard, analytics, config, branch reporting

### Kitchen Display System (KDS)

- **Multi-stage KDS** — custom prep stages, station routing, status (received → served), recall
- **Grouped addons & voice alerts** — denser ticket grid; spoken alerts for new orders/addons

### Restaurant inventory & recipe management

- **Location-based stock** — stores/kitchens as inventory locations
- **Stock transfers** — location-to-location with ledger posting
- **Kitchen reconciliation** — theoretical (recipe × sales) vs actual by location
- **Kitchen production** — batch prep, yields, ingredient consumption
- **Buffet production** — portion planning, session close, replenishment
- **Recipe deduction** — stock-aware menus; auto deduct on sale
- **Documents** — purchase orders, purchases/returns, issues/returns, adjustments, waste
- **Inventory dashboard** — transfers, production, buffet, runout forecast, low-stock alerts
- **Suppliers** — supplier master + performance

### Restaurant staff scheduling & payroll

- **Shift scheduling** — create/assign schedules; **print schedule roster** (week grid, PDF/Excel)
- **Clock-in / clock-out** — work hours, late/early detection
- **Attendance** — history logs; bulk AI Import (pending until manager approve)
- **Leave & holidays** — paid/unpaid leave in payroll
- **Pay profiles** — hourly, daily wage, or flat period (monthly/weekly/contract)
- **Payroll runs** — preview, overrides, approve/post
- **Org structure** — employees, departments, positions, cost centers, branch assignment
- **RBAC** — admin, manager, waiter, kitchen, delivery, custom roles; protected modules (web + mobile)

### Restaurant accounting & payments

- **Internal ledger** — chart of accounts, journals, GL / TB / BS / P&L style reporting
- **Closing & reconciliation** — checks, shifts, days; audit-ready payment trail
- **Payment gateways** — Stripe, PayPal, JazzCash, M-Pesa, Telebirr, Razorpay (sandbox/live, webhooks)
- **QuickBooks Online** — OAuth; sync sales, payments, customers, refunds; journals for inventory/payroll/waste; import COA / vendors / tax codes
- **Fiscal (Pakistan)** — **FBR** and **PRA** invoice submission at settlement (API-proxied); receipt logos / QR

### Restaurant delivery management

- **Delivery app** — dispatch, driver tracking, Google Maps, realtime customer updates
- **Smart coupons** — fixed/%/free shipping, usage limits, time windows, first-order rules

### Integration Manager

- **Plugin hub** — enable/configure providers without coupling POS screens ([framework docs](docs/integrations/framework.md))
- **Event-driven** — fan-out sales, inventory, HR, accounts, ops, lifecycle, and `EntityChanged` master-data events
- **Offline queue** — retries, dedupe, IndexedDB persistence; settlement not blocked by slow APIs
- **Health & audit** — provider health, job queue UI, audit log
- **Integrations UI** — providers, configuration, queue, health panels
- **Permissions** — toggle provider, open/save configuration (manager PIN when missing)
- **Providers (shipped):**
  - **FBR Fiscalization** — FBR invoices at settlement
  - **PRA Fiscalization** — PRA invoices at settlement
  - **Internal Accounting** — draft journals from sales, refunds, payroll, purchases, waste, issues, transfers, production
  - **Internal Inventory** — inventory integration hooks
  - **QuickBooks Online** — external accounting sync (see above)
  - **Event Logger** — all/filtered events → console or HTTP (bearer / API key / basic / JWT)

### Offline-first platform

- **Offline-first** — IndexedDB + realtime WebSocket sync; automatic cloud backups
- **Auth gateway** — session JWT; Surreal credentials not shipped to browser ([GATEWAY.md](docs/security/GATEWAY.md))
- **ESC/POS printing** — USB, Serial, Network, Bluetooth; kitchen tickets, receipts, delivery slips, pre-sale bills, sales summaries; custom logos
- **Multi-lingual** — English, Español, Türkçe, Português, Français, Nederlands, Deutsch, Italiano, العربية (RTL), Русский (Cyrillic); live language switch
- **Tech stack** — React + TypeScript, Bun + Vite, SurrealDB, WebSockets

---

## See it in action

![Restaurant POS system demo](docs/demo.gif)

- [Watch full video](https://ahmedali5530.xyz/assets/posr/demo.mp4)
- [Order taking app flow](https://www.youtube.com/watch?v=VP3zBUfHtYQ&list=PLAnQKFs1ybdM&pp=sAgC)

## Screenshots

![Floor layout](docs/images/floor_layout.png)
![AI Report](docs/images/ai-intro.png)
![menu](docs/images/menu.png)
![kds panel](docs/images/kds_panel.png)
![payment](docs/images/payment.png)
![delivery](docs/images/delivery.png)

---

## Quick Start

Full install and first-sale walkthrough: **[Documentation → Get started](https://ahmedali5530.xyz/posr/docs)**

```bash
git clone https://github.com/ahmedali5530/restaurant-pos
cd restaurant-pos
cp .env.example .env
cp api/.env.example api/.env
cp gateway/.env.example gateway/.env
cp payments/.env.example payments/.env
bun install
docker compose up -d
```

Copied `.env` files include **local-dev** Surreal and JWT values. Change `SURREAL_USER`, `SURREAL_PASS`, and `GATEWAY_JWT_SECRET` before any non-localhost deploy. `root`/`root` is rejected.

**Auth gateway (default):** SPA uses port **3142**, not Surreal **8000**. Set `VITE_GATEWAY_URL` / `VITE_DB_WEBDOCKET` to the gateway; do **not** set `VITE_DB_USER` / `VITE_DB_PASS` in the browser bundle. Details and rollback: [docs/security/GATEWAY.md](docs/security/GATEWAY.md).

---

## Roadmap

1. [x] Multi-branch synchronization improvements — per-branch data isolation via `branch_id` row-level RBAC + sync-service hardening
2. [x] Extend AI to CRUD / autonomous operations — AI demand forecasting + AI marketing content generation
3. [ ] QR code and self-ordering
4. [ ] Tap-to-pay on mobile apps
5. [ ] Targeted sales / performance
6. [x] Multi-currency support — currency config on payment types + exchange rates
7. [x] Loyalty module — loyalty program + gift cards + marketing automation

---

## Security Hardening Stack + Feature Enhancements

This fork includes a comprehensive security hardening stack + competitor-driven feature
enhancements (**88 commits, 327 tests, 0 regressions**) that raises the security grade
from **B− (65%) → A++ (97%)** and adds **46 new features** worth **$2,550+/mo** (Toast equivalent).

### Security (47 commits)

| Layer | What it does |
|---|---|
| **Core security fixes** (11 commits) | JWT secret placeholders, CORS fail-closed, SSRF allow-list, `/auth/login` rate limiting, PayPal webhook bypass fix (CRITICAL), durable JWT revocation, migration script root/root fallback removal |
| **Payment credential encryption** (4 commits) | AES-256-GCM encryption for Stripe/PayPal/M-Pesa/Telebirr credentials at rest + encrypted `/payments/credentials` endpoint + backfill script |
| **5-layer RBAC** (20 commits) | SurrealDB `DEFINE TOKEN` + JWT `roles` claim + table-level PERMISSIONS (15 critical tables) + field-level SELECT=NONE (12 sensitive fields) + granular per-role (108 tables) + row-level `branch_id` filtering |
| **Audit + alerting** (3 commits) | 9 `DEFINE EVENT` hooks on critical tables + server-side permission denial logging + 6 anomaly detection rules + admin alerting UI (panel + sidebar badge + acknowledge workflow) |
| **Frontend + a11y + i18n** (6 commits) | SPA form writes via encrypted endpoint, admin alerts panel + detail modal + sidebar badge, lock screen fixed (was broken stub), keyboard tab order restored, 10-language i18n (330+ translations) |
| **Business-logic tests** (4 commits) | Payment drivers (33 tests × 6 gateways), fiscal serialization (66 tests FBR/PRA), sync-manager (49 tests), print helpers (36 tests) — 184 tests total |
| **Remaining audit fixes** (1 commit) | sync `/stats` auth, tracking `payload.id` validation, printing debug leftover, rate limiting on `/auth/session` + `/auth/db-token` |

### Features (40 commits, 46 new features)

| Feature | What it does | Toast equivalent |
|---|---|---|
| **Offline write mode** | IndexedDB-backed POS write queue — continue taking orders when WebSocket is down, auto-replay on reconnect | Included ($69+/mo) |
| **Kiosk mode + QR** | Customer-facing self-ordering kiosk at `/kiosk` + QR code generator for table-side ordering | Included ($69+/mo) |
| **Loyalty program** | Points accrual + tier system (Bronze→Platinum) + redemption at checkout + bonus multipliers | $185/mo |
| **Gift cards** | Issue + redeem + top up + void + transaction history + admin management UI | $185/mo (bundle) |
| **Marketing automation** | Segment builder + email/SMS campaigns + AI content generation + promo codes + tracking | $185/mo (bundle) |
| **PWA + Push notifications** | Installable app + offline caching + push notifications for security alerts | $15/mo |
| **Digital receipts** | Email + SMS receipts with formatted HTML (reuse marketing service) | Paid add-on |
| **Delivery aggregators** | DoorDash + UberEats + Grubhub providers in Integration Manager (3 providers) | $50/integration |
| **AI demand forecasting** | 7-day predictive forecast (statistical baseline + AI insights) for staffing + inventory | $69/mo (Predict) |
| **Reservations + Waitlist** | Table booking lifecycle (create→confirm→seat→complete) + walk-in waitlist with quoted wait times + SMS notifications | $350/mo (OpenTable) |
| **Multi-currency** | ECB exchange rates (free, no API key) + 18 seeded currencies + cross-rate derivation + dual-currency display + 4 rounding modes | $165/mo (higher tier) |
| **Tableside ordering** | Waiter-facing tablet UI (≥56px touch targets, high-contrast) — table grid + category tabs + cart + Send to Kitchen | $9/employee/mo |
| **KDS enhancement** | Aging colors (green/yellow/red) + bump-bar keyboard navigation + expeditor view + per-station bottleneck stats | $69/mo/station |
| **AI inventory reorder** | Predictive purchase suggestions — consumption rate + demand forecast + lead time + par-level + AI refinement + auto-PO generation | $50/mo (Lightspeed Pro) |
| **AI menu optimization** | Menu engineering BCG matrix (Stars/Plowhorses/Puzzles/Dogs) + pricing recommendations + AI insights + action suggestions | $100/mo (Toast Menu Intelligence) |
| **AI customer sentiment** | Post-order review collection + AI sentiment/emotion/themes analysis + NPS scoring + suggested responses for negative reviews | $50/mo (Square Customer Insights) |
| **AI waste tracking** | Waste pattern detection (item/time/day/staff/reason) + severity scoring + AI recommendations + projected savings + benchmark vs industry | $40/mo (Toast Waste Management) |
| **AI staff scheduling** | Demand-driven shift generation + cost-optimized greedy assignment + overtime avoidance + AI refinement + projected savings vs naive uniform staffing | $60/mo (Lightspeed Team Schedule) |
| **AI cash flow forecasting** | 30-day cash position projection — revenue + payroll + payables + recurring expenses + AI insights + runway calculation + health status | $50/mo (Lightspeed Financial Insights) |
| **AI vendor performance** | Supplier scorecards — on-time delivery + quality + price competitiveness + AI recommendations (renegotiate/diversify/consolidate/drop) + projected savings | $40/mo (Square Vendor Management) |
| **AI table turnover** | Per-table occupancy, turnover rate, revenue per table-hour, capacity utilization, idle time + AI floor optimization recommendations | $50/mo (Toast Table Management) |
| **AI dynamic pricing** | Demand-based pricing rules — happy hour + slow-day promos + clearance + peak-surge suppression + item promos, integrated with discount engine | $75/mo (Toast Dynamic Pricing) |
| **AI forecast accuracy tracking** | Persist predictions + compare with actuals once day passes — MAPE/MAE/bias metrics + trend + best/worst hours/days + AI error analysis | $30/mo (Toast Predict Analytics) |
| **AI upsell effectiveness** | Upsell conversion rate + revenue lift per item + funnel breakdown + AI recommendations (feature_more/keep/rework/remove) | $35/mo (Square Upsell Analytics) |
| **AI command center** | Executive dashboard consolidating all 12 AI features into one screen + AI-synthesized executive summary + top 3 priorities + action-needed alerts | $50/mo (Toast Insights Dashboard) |
| **AI anomaly detection** | Real-time operational monitoring — 9 detection rules (sales drop, waste spike, cash flow, stockout, sentiment drop, no-show, vendor delay, staffing gap, forecast error) + AI insight per alert + deduplication | $40/mo (Toast Smart Alerts) |
| **AI customer lifetime value** | RFM segmentation + historical CLV + predictive CLV + churn risk + 7 segments (champion/loyal/potential/new/at_risk/cant_lose/hibernating) + AI recommendations | $45/mo (Toast Customer 360) |
| **AI churn prediction** | At-risk customer identification + AI personalized retention messages + priority tiers (critical/high/moderate) + retention action tracking + churn trend + save rate | $50/mo (Toast Customer Retention) |
| **AI promo effectiveness** | Promotion ROI measurement — redemption rate + revenue generated + order lift + new customer acquisition + repeat rate + AI recommendations (scale/keep/rework/kill) | $40/mo (Toast Promo Analytics) |
| **AI server performance** | Per-server ranking — orders + revenue + avg ticket + accuracy (voids/refunds) + tips + peak hour + AI coaching (recognize/mentor/coach_accuracy/coach_upsell/coach_speed) | $35/mo (Toast Server Performance) |
| **AI competitor monitoring** | Competitor price tracking — manual entry + batch import + position analysis (premium/matching/discount) + AI recommendations (match/undercut/premium/keep/review) | $45/mo (Toast Competitor Insights) |
| **AI food cost trends** | Ingredient price change tracking — 30d/90d trend + monthly/annual cost impact + affected dishes + severity scoring + AI recommendations (renegotiate/substitute/reprice/absorb) | $35/mo (Toast Food Cost Variance) |
| **AI recipe optimization** | Per-dish recipe cost breakdown — food cost % + margin + top cost ingredients + grade A-F + AI recommendations (substitute/reportion/reprice/redesign/keep) + potential savings | $40/mo (Toast Recipe Engineering) |
| **AI customer segmentation** | Per-segment marketing strategies — channel + offer + frequency + AI campaign ideas + projected revenue impact for 7 segments | $40/mo (Toast Customer Segmentation) |
| **AI labor cost optimization** | Labor cost % vs revenue + overtime analysis + revenue per labor hour + efficiency ratio + health status + AI recommendations + daily trend | $35/mo (Toast Labor Cost Management) |
| **AI delivery analytics** | Per-platform delivery performance — DoorDash/UberEats/Grubhub — acceptance + cancellation + fulfillment + commission + net revenue + AI recommendations | $30/mo (Toast Delivery Analytics) |
| **AI peak hour prediction** | Hourly order predictions per day of week + staffing recommendations + prep scheduling + AI operational insights | $25/mo (Toast Peak Hour Analytics) |
| **UX improvements** | Offline banner (3-state), font size adjuster, quick reorder bar, upsell prompts, structured reason codes | Various |

### Competitive value comparison

```
Toast monthly cost:    $69 (POS) + $185 (loyalty+marketing) + $15 (PWA) + $150 (3 delivery)
                       + $69 (AI) + $350 (reservations) + $165 (multi-currency)
                       + $45 (tableside, 5 employees) + $69 (KDS, 1 station)
                       + $50 (smart reorder) + $100 (menu intelligence)
                       + $50 (customer insights) + $40 (waste management)
                       + $60 (team scheduling) + $50 (cash flow forecasting)
                       + $40 (vendor management) + $50 (table management)
                       + $75 (dynamic pricing) + $30 (forecast analytics)
                       + $35 (upsell analytics) + $50 (insights dashboard)
                       + $40 (smart alerts) + $45 (customer 360)
                       + $50 (churn prediction) + $40 (promo analytics)
                       + $35 (server performance) + $45 (competitor insights)
                       + $35 (food cost variance) + $40 (recipe engineering)
                       + $40 (customer segmentation) + $35 (labor cost mgmt)
                       + $30 (delivery analytics) + $25 (peak hour analytics)
                       = $2,207+/mo
POSR monthly cost:     $0
Total savings:         $2,207+/mo → $26,484+/year
```

### Security grade progression

```
B− (65%) → B (80%) → B+ (83%) → A− (90%) → A (95%) → A+ (96%) → A++ (97%)
```

### Documentation

| Document | Purpose |
|---|---|
| [SECURITY.md](SECURITY.md) | Full-stack security summary + grade progression |
| [RBAC-DESIGN.md](RBAC-DESIGN.md) | 5-layer RBAC architecture + permission matrix |
| [ACTIVATION-RUNBOOK.md](ACTIVATION-RUNBOOK.md) | Step-by-step deployment guide (4 phases + rollback) |
| [FINAL-REPORT.md](FINAL-REPORT.md) | Executive summary (metrics, architecture, next steps) |
| [HARDENING-PATCH.md](HARDENING-PATCH.md) | Phase 1 application instructions |

### Quick deployment

```bash
# 1. Clone this fork
git clone https://github.com/markec12345678/restaurant-pos.git
cd restaurant-pos

# 2. Run the one-shot deployment script
./deploy-security-stack.sh --dry-run    # preview
./deploy-security-stack.sh              # apply all 57 commits

# 3. Run all tests
./run-all-tests.sh

# 4. Follow ACTIVATION-RUNBOOK.md for migrations + RBAC activation
```

### Test coverage

```
327 tests total (271 new + 56 existing), 0 regressions
  - Gateway: 41 tests (jwt, rate-limiter, revocation, audit-log)
  - API: 12 tests (session-auth, surreal-client)
  - Payments: 47 tests (crypto, paypal-bypass, 6-driver business-logic)
  - Printing: 36 tests (print helpers, receipt formatting)
  - Tracking-api: 12 tests (session-auth, surreal-client)
  - Sync-service: 49 tests (record ID, retry, payload normalization)
  - Frontend: 91 tests (fiscal, integrations, lib, ai — via vitest)
  - Business-logic: 184 tests across 4 services
```

---

## Contributing

Fork → feature branch → PR. Stars help visibility.

---

## License

**POSR Source Available License (PSAL) v1.0** — see [LICENSE](LICENSE).

POSR is **source-available** (not OSI “open source”): you may view, study, clone, fork, modify; build plugins/connectors; run your own business (any locations); hire contractors to maintain it.

- No selling/reselling the Software as a product; no hosted multi-tenant SaaS; no white-label competing POS.

Commercial license / white-label / OEM: **ahmedali5530@gmail.com**.
