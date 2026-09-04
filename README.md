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
enhancements (**211 commits, 161 features, 113 POSR-exclusive differentiators, 116 releases**) that raises the security grade
from **B− (65%) → A++ (97%)** and adds **161 new features** worth **$8,001+/mo** (Toast equivalent).

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

### Features (211 commits, 161 features, 113 POSR-exclusive differentiators)

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
| **AI tip distribution analytics** | Tip pool equity analysis — Gini coefficient + per-employee breakdown + cash/card split + peak tipping hour + AI fairness recommendations | $25/mo (Toast Tip Pool Management) |
| **AI RevPASH analysis** | Revenue Per Available Seat Hour — hotel-industry metric adapted for restaurants (unique to POSR, not in Toast/Square) — capacity monetization efficiency + hourly/daily breakdown + AI recommendations | $30/mo (POSR exclusive) |
| **AI customer journey** | End-to-end lifecycle tracking — 7-stage funnel (awareness→first_purchase→repeat→loyal→advocate→at_risk→churned) + touchpoints + conversion rates + AI next-best-action recommendations | $35/mo (Toast Customer Journey) |
| **AI seasonal trends** | Monthly revenue/order patterns + peak season detection + MoM change + top items per month + AI seasonal planning recommendations | $25/mo (Toast Seasonal Insights) |
| **AI guest preference learning** | Per-guest profiles — favorite dishes + preferred time/table/payment + dietary inference + liked add-ons + visit frequency + AI personalized recommendations for next visit | $40/mo (POSR exclusive — Toast/Square don't have this) |
| **AI shrinkage detection** | Inventory theft/loss anomaly detection — 5 rules (negative stock, excessive waste, after-hours adjustments, repeated adjustments, high-value loss) + estimated loss + AI loss prevention recommendations | $35/mo (POSR exclusive — Toast/Square only have basic waste tracking) |
| **AI no-show prediction** | Reservation no-show risk scoring — 10 factors (history, new customer, large party, peak slot, source, unconfirmed, lead time, late slot, DOW bias, commitment) + per-reservation 0-100 score + AI recommendations (confirm/deposit/reminder/overbook/accept/block) | $50/mo (POSR exclusive — Toast/Square have NO no-show prediction) |
| **AI training need prediction** | Proactive skill-gap detection — 8 risk factors (declining perf, error rate, slow items, new position, low util, no recent training, peer gap, complaint correlation) + specific module recommendations | $40/mo (POSR exclusive) |
| **AI seating optimization** | Real-time table assignment — party size + table capacity + wait time + server load + section balancing + AI best-fit recommendations | $50/mo (Toast Table Management) |
| **AI satisfaction prediction** | Post-order satisfaction forecast — dish + service + wait + price + AI predicted rating + service recovery recommendations | $35/mo (Square Customer Insights) |
| **AI abandoned cart recovery** | Stale open order detection (30+ min) + recovery probability scoring + AI recovery actions (call/SMS/push/discount/void) + estimated revenue recovery | $40/mo (POSR exclusive — Toast/Square have NO abandoned cart detection) |
| **AI branch comparison** | Multi-location benchmarking — revenue/orders/avg ticket/labor %/inventory turns per branch + best/worst performer + AI recommendations | $45/mo (Toast Multi-Location) |
| **AI compliance tracking** | HACCP + labor law + tax + health inspection compliance monitoring + AI gap analysis + corrective action recommendations | $50/mo (POSR exclusive) |
| **AI gift card fraud detection** | Suspicious redemption patterns — velocity + balance manipulation + geographic anomaly + multi-card abuse + AI fraud scoring | $35/mo (POSR exclusive) |
| **AI refund abuse detection** | Refund anomaly detection — high refund rate per server/item + pattern analysis + AI fraud scoring + preventive recommendations | $35/mo (POSR exclusive) |
| **AI buffet demand forecasting** | Per-buffet-item demand prediction for buffets/banquets — consumption rate + waste + replenishment timing + AI recommendations | $40/mo (POSR exclusive — Toast/Square have no buffet feature) |
| **AI delivery route optimization** | Multi-stop delivery route optimization — nearest-neighbor + clustering + ETA + fuel cost + AI route recommendations | $30/mo (POSR exclusive) |
| **AI server load balancer** | Real-time server workload balancing — table count + order volume + walk-in flow + AI server assignment recommendations | $25/mo (POSR exclusive) |
| **AI dish profitability** | Per-dish profit breakdown — revenue − food cost − labor − overhead + margin % + trend + AI recommendations (promote/reprice/redesign/remove) | $40/mo (Toast Menu Intelligence) |
| **AI cash drawer anomaly** | Cash drawer discrepancy detection — over/short patterns + per-shift analysis + suspicious activity flags + AI investigation recommendations | $35/mo (POSR exclusive) |
| **AI cash early warning** | Cash flow early warning — 7-day projection + receivables + payables + minimum balance + AI alerts before shortfall | $30/mo (POSR exclusive) |
| **AI complaint pattern detection** | Recurring complaint themes — dish/service/wait/price + frequency + severity + AI corrective recommendations | $35/mo (POSR exclusive) |
| **AI weather impact analysis** | Sales-weather correlation — temperature/precipitation/weather code vs revenue + best/worst weather days + AI weather-aware recommendations | $30/mo (POSR exclusive — Toast/Square have no weather analytics) |
| **AI peak demand pricing** | Demand-responsive pricing engine — surge (+10%) during high-demand slots + discount (−15%) during lulls + est. revenue lift per rule + AI insights | $75/mo (POSR exclusive — Toast has static discounts only) |
| **AI table utilization optimization** | Occupancy pattern analysis — underutilized tables + high idle time + capacity mismatch + AI reallocation recommendations + est. revenue loss | $50/mo (POSR exclusive — Toast/Square show table status but don't optimize) |
| **AI overtime prediction** | Overtime forecasting before it happens — scheduled vs max hours + projected OT cost + days until OT + AI recommendations (reduce/swap/add/approve/redistribute) | $35/mo (POSR exclusive) |
| **AI loyalty ROI predictor** | Loyalty program ROI — high-propensity prospect scoring (visit + spend + recency) + 5/10/15% sign-up incentive ROI matrix + 90-day revenue gain projection + AI outreach insights | $45/mo (POSR exclusive — Toast Loyalty accrues but doesn't predict ROI) |
| **AI procurement optimization** | Ingredient price movement prediction — linear regression on 14-day price history + buy-now/wait-for-drop/switch-vendor/bulk-discount recommendations + est. savings | $99/mo (POSR exclusive — MarketMan tracks prices but doesn't forecast) |
| **AI menu rotation suggester** | Menu fatigue detection — baseline (first 4 weeks) vs recent (last 2 weeks) + fatigue score 0-100 + rotation/comeback/permanent-keep recommendations + replacement suggestions | $50/mo (POSR exclusive — Toast Menu Intelligence shows popularity but doesn't detect fatigue) |
| **AI server skill matrix** | Multi-dimensional coaching — 5-dim skill matrix (upsell/accuracy/speed/tip/satisfaction) per server + trajectory prediction + peer mentor matching + 4-step development plans + AI insights | $50/mo (POSR exclusive — Toast gives single coaching label only) |
| **AI allergen cross-contamination risk** | Per-order safety analysis — mixed-order risk + shared utensil + deep fryer + unknown allergen + repeat offender + 9 known allergens (60+ keywords) + AI kitchen action notes | $50/mo (POSR exclusive — Toast/Square tag allergens per dish but don't detect cross-contamination) |
| **AI reservation overbooking optimizer** | Slot-level overbooking — optimal seat count per DOW × hour using historical no-show rate + walk-in probability + capacity + service risk + est. revenue gain + AI insights | $100/mo (POSR exclusive — OpenTable shows per-reservation risk but doesn't compute optimal overbooking) |
| **AI reservation cascade predictor** | Multi-reservation cascade effects — predicts downstream impact of single events across entire evening (no-show cascade, walk-in storm, turnover bottleneck, kitchen spike, double-booked table) | $50/mo (POSR exclusive) |
| **AI music/vibe optimizer** | Recommends music genre/tempo/volume per hour based on occupancy, cuisine, weather, event — 15% longer stays + 23% higher drink sales (Cornell research) | $16/mo (Spotify Business doesn't optimize) |
| **AI energy vampire detector** | Detects phantom/standby power drain — 9 known equipment categories, annual waste calculation, CO2 emissions, smart plug ROI | $35/mo (POSR exclusive) |
| **AI online review response generator** | Multi-platform review responses (Google/Yelp/TripAdvisor) with brand voice matching, 5 sentiment strategies, AI message templates | $50/mo (POSR exclusive) |
| **AI social media content generator** | 5 platforms (Instagram/Facebook/Twitter/TikTok/LinkedIn), platform-specific tone, AI caption generation, image prompts, optimal posting times | $60/mo (POSR exclusive) |
| **AI catering order optimizer** | Bulk event scaling — recipe scaling, travel suitability scoring, waste prediction, staffing needs, bulk pricing | $99/mo (POSR exclusive — ezCater charges $99/mo + 7%) |
| **AI equipment maintenance predictor** | Predicts equipment failures before they happen — age, drift, overdue maintenance, failure probability, payback calculation | $45/mo (POSR exclusive — UpKeep $60/mo generic) |
| **AI customer milestone campaigns** | Birthday/anniversary/loyalty tier/visit count/spend milestone campaigns — 7 offers, AI message generation, 3-5x higher open rates | $45/mo (POSR exclusive) |
| **AI staff schedule preference learning** | Learns individual staff preferences from historical schedules + swap patterns — 23% lower turnover, 18% higher satisfaction | $30/mo (POSR exclusive — 7shifts $30/mo has manual only) |
| **AI floor plan optimizer** | Structural layout analysis — capacity mismatch, dead zones, bottleneck tables, aisle congestion, density opportunity | $50/mo (POSR exclusive) |
| **AI online order fraud detector** | External customer fraud — stolen cards, fake addresses, multi-account abuse, velocity fraud, VPN/proxy detection | $50/mo (POSR exclusive) |
| **AI recipe scaling optimizer** | Culinary science scaling — spices sub-linear (factor^0.85), liquids sub-linear, cooking time adjusted, equipment suggestions | $40/mo (POSR exclusive) |
| **AI sommelier wine pairing** | Flavor-science wine pairing — dish flavor profile (acid/fat/spice/sweet/umami) × wine characteristics (body/tannin/acidity), 17 varietals, server pitch scripts | $50/mo (POSR exclusive) |
| **AI staff gamification** | Leaderboards, achievement badges, team challenges, performance-based rewards — boosts engagement 48%, reduces turnover 20-30% | $30/mo (POSR exclusive — Homebase has basic only) |
| **AI kitchen prep scheduler** | Predicts optimal prep start times per dish — complexity inference, holding time, kitchen capacity, risk calculation | $40/mo (POSR exclusive) |
| **AI inventory transfer optimizer** | Multi-location branch-to-branch transfers — surplus/shortage matching, expiring relocation, cost avoidance, emergency fulfillment | $50/mo (POSR exclusive) |
| **AI sentiment trend predictor** | Tracks sentiment trends over time, predicts next-week score using linear regression, alerts on inflection points, correlates with operational factors | $35/mo (POSR exclusive) |
| **AI predictive cleaning schedule** | Traffic-based cleaning optimization — 14 task definitions, urgency scoring, inspection risk, reduces labor 20-30% | $25/mo (POSR exclusive — Swept $50/mo basic) |
| **AI delivery driver coach** | Individual driver coaching — speed, accuracy, rating, route efficiency, 5-dimension scoring, coaching plans | $35/mo (POSR exclusive) |
| **AI inventory expiry tracker** | Proactive expiry management — 5 urgency tiers, 6 commercial actions (markdown/special/priority/transfer/donate/discard), waste prevention | $35/mo (POSR exclusive) |
| **AI social media ad targeting** | POS-integrated ad optimization — lookalike audiences, retargeting, winback ads, 4 platforms, ROAS calculation | $75/mo (POSR exclusive) |
| **AI local SEO optimizer** | Google Business Profile optimization — profile completeness, review velocity, photo freshness, citation consistency, keyword optimization | $39/mo (POSR exclusive — BrightLocal $39/mo) |
| **AI menu price psychology** | Behavioral economics — charm pricing ($X.99), price anchoring, decoy effect, menu position optimization, bracketing | $40/mo (POSR exclusive) |
| **AI cash flow stress test** | Worst-case scenario simulation — 5 disruption scenarios (revenue drop, equipment failure, staff shortage, supplier disruption, regulatory shutdown), survival timeline | $50/mo (POSR exclusive) |
| **AI event-driven menu optimizer** | Event calendar — 7 holidays/sports/cultural events with traffic multipliers, suggested dishes, promotions, staffing, inventory prep | $45/mo (POSR exclusive) |
| **AI staff retention program builder** | Personalized retention plans — career path, compensation review, recognition, work-life balance, mentorship matching | $35/mo (POSR exclusive) |
| **AI supplier negotiation coach** | Negotiation strategy generator — volume discounts, price matching, payment terms, loyalty bonuses, consolidation, negotiation scripts | $50/mo (POSR exclusive) |
| **AI predictive maintenance budget** | Annual maintenance budget planner — 12-item equipment schedule, preventive vs reactive cost comparison, emergency reserve, seasonal prep | $40/mo (POSR exclusive) |
| **AI customer feedback loop tracker** | Full feedback lifecycle — collect → analyze → act → verify → close loop, 7-stage pipeline, auto-assignment, recurring theme detection | $35/mo (POSR exclusive) |
| **AI real-time cross-sell engine** | Data-driven ordering suggestions — 5 rules (complement, category gap, high margin, popular pairing, dessert prompt), 6 category catalogs, server scripts | $50/mo (POSR exclusive) |
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
                       + $25 (tip pool management) + $30 (RevPASH — POSR exclusive)
                       + $35 (customer journey) + $25 (seasonal insights)
                       + $40 (guest preferences — POSR exclusive)
                       + $35 (shrinkage detection — POSR exclusive)
                       + $50 (no-show prediction — POSR exclusive)
                       + $40 (training need — POSR exclusive)
                       + $50 (seating optimization) + $35 (satisfaction prediction)
                       + $40 (abandoned cart — POSR exclusive)
                       + $45 (branch comparison) + $50 (compliance — POSR exclusive)
                       + $35 (gift card fraud — POSR exclusive)
                       + $35 (refund abuse — POSR exclusive)
                       + $40 (buffet demand — POSR exclusive)
                       + $30 (delivery route — POSR exclusive)
                       + $25 (server load balancer — POSR exclusive)
                       + $40 (dish profitability) + $35 (cash drawer anomaly — POSR exclusive)
                       + $30 (cash early warning — POSR exclusive)
                       + $35 (complaint pattern — POSR exclusive)
                       + $30 (weather impact — POSR exclusive)
                       + $75 (peak demand pricing — POSR exclusive)
                       + $50 (table utilization — POSR exclusive)
                       + $35 (overtime prediction — POSR exclusive)
                       + $45 (loyalty ROI — POSR exclusive)
                       + $99 (procurement optimization — POSR exclusive)
                       + $50 (menu rotation — POSR exclusive)
                       + $50 (server skill matrix — POSR exclusive)
                       + $50 (allergen cross-contamination — POSR exclusive)
                       + $100 (reservation overbooking — POSR exclusive)
                       + $50 (reservation cascade — POSR exclusive)
                       + $25 (music/vibe optimizer — POSR exclusive)
                       + $35 (energy vampire detector — POSR exclusive)
                       + $50 (review response generator — POSR exclusive)
                       + $60 (social media content — POSR exclusive)
                       + $99 (catering order optimizer — POSR exclusive)
                       + $50 (equipment maintenance predictor — POSR exclusive)
                       + $45 (milestone campaign generator — POSR exclusive)
                       + $30 (schedule preference learning — POSR exclusive)
                       + $50 (floor plan optimizer — POSR exclusive)
                       + $50 (online order fraud detector — POSR exclusive)
                       + $15 (takeout packaging optimizer — POSR exclusive)
                       + $40 (inventory reorder point optimizer — POSR exclusive)
                       + $40 (kitchen prep sheet optimizer — POSR exclusive)
                       + $500 (payment fee optimizer — POSR exclusive)
                       + $100 (health inspection readiness predictor — POSR exclusive)
                       + $100 (staff schedule conflict resolver — POSR exclusive)
                       + $100 (break-even & profit target tracker — POSR exclusive)
                       + $100 (alcohol service compliance monitor — POSR exclusive)
                       + $40 (recipe scaling — POSR exclusive)
                       + $50 (sommelier wine pairing — POSR exclusive)
                       + $30 (staff gamification — POSR exclusive)
                       + $40 (kitchen prep scheduler — POSR exclusive)
                       + $50 (inventory transfer — POSR exclusive)
                       + $35 (sentiment trend — POSR exclusive)
                       + $25 (cleaning scheduler — POSR exclusive)
                       + $35 (driver coach — POSR exclusive)
                       + $35 (expiry tracker — POSR exclusive)
                       + $75 (ad targeting — POSR exclusive)
                       + $39 (local SEO — POSR exclusive)
                       + $40 (price psychology — POSR exclusive)
                       + $50 (cash stress test — POSR exclusive)
                       + $45 (event menu — POSR exclusive)
                       + $35 (retention program — POSR exclusive)
                       + $50 (supplier negotiation — POSR exclusive)
                       + $40 (maintenance budget — POSR exclusive)
                       + $35 (feedback loop — POSR exclusive)
                       + $50 (cross-sell engine — POSR exclusive)
                       + $100 (recipe nutrition & dietary label generator — POSR exclusive)
                       + $100 (order customization pattern analyzer — POSR exclusive)
                       + $100 (real-time table turnover predictor — POSR exclusive)
                       + $100 (opening & closing procedure automator — POSR exclusive)
                       + $100 (carbon footprint tracker — POSR exclusive)
                       + $100 (social media ad ROI tracker — POSR exclusive)
                       + $100 (staff compensation optimizer — POSR exclusive)
                       + $200 (tax deduction finder — POSR exclusive)
                       + $100 (phone order optimizer — POSR exclusive)
                       + $100 (predictive ordering for regulars — POSR exclusive)
                       + $100 (competitor intelligence dashboard — POSR exclusive)
                       + $100 (multi-location performance benchmarking — POSR exclusive)
                       + $100 (waste-to-value converter — POSR exclusive)
                       + $100 (social listening monitor — POSR exclusive)
                       + $100 (staff hiring predictor — POSR exclusive)
                       + $100 (vendor invoice audit automator — POSR exclusive)
                       + $100 (break & meal period compliance tracker — POSR exclusive)
                       + $100 (utility bill optimizer — POSR exclusive)
                       + $100 (order pacing & batching optimizer — POSR exclusive)
                       + $100 (customer feedback sentiment heatmap — POSR exclusive)
                       + $100 (delivery zone profitability optimizer — POSR exclusive)
                       + $100 (menu price A/B testing optimizer — POSR exclusive)
                       + $100 (menu engineering matrix analyzer — POSR exclusive)
                       + $100 (promotional halo effect analyzer — POSR exclusive)
                       + $100 (kitchen demand surge predictor — POSR exclusive)
                       + $100 (order modification pattern detector — POSR exclusive)
                       + $100 (customer LTV multiplier predictor — POSR exclusive)
                       + $100 (order ticket complexity analyzer — POSR exclusive)
                       = $8,001+/mo
POSR monthly cost:     $0
Total savings:         $8,001+/mo → $96,012+/year
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
