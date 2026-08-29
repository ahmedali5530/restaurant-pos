export interface ReleaseNotes {
  date: string
  title?: string
  items: string[]
}

/** Newest-first release notes shown in the What's New dialog. */
export const RELEASES: ReleaseNotes[] = [
  {
    date: '2026-08-28',
    title: 'AI assistant help and markdown tables',
    items: [
      'The assistant toolbar now has a ? button with clickable example prompts for sales, tables, discounts, dishes, users, and inventory.',
      'Assistant display name is configurable via VITE_AI_ASSISTANT_NAME (defaults to Kashif).',
      'Markdown tables in assistant answers now render correctly instead of showing raw pipe text.',
      'Write proposal review for wide configs (e.g. discounts) now uses a readable card layout with only filled-in fields instead of squeezing dozens of columns into one row.',
      'Discount write proposals no longer send null max_cap values that could fail SurrealDB schema coercion on confirm.',
      'The floating AI assistant now appears only on back-office screens (Manage, Inventory, Reports, HR, Accounts, Integrations, Tips, and Clock) and is hidden on cashier-facing POS screens.',
      'Discount import and list tools now preserve full Surreal record ids (e.g. category:…) for BXGY targets instead of stripping the table prefix.',
      'Assistant write tools now recognize create/update requests in Turkish and other supported languages, not only English keywords.',
      'Assistant now routes purchase history to posted inventory purchases (get_inventory_documents) instead of purchase orders, with dedicated support for issues, returns, waste, adjustments, and transfers.',
      'Voided inventory purchases now query get_inventory_documents with documentStatus=voided instead of POS order voids (get_voids) or purchase orders.',
    ],
  },
  {
    date: '2026-08-28',
    title: 'Kashif Manage parity',
    items: [
      'The AI assistant can now list Manage configuration data — floors, tables, discounts, users, roles, kitchens, coupons, menus, workflows, printers, and more — using dedicated list_* read tools gated on admin permissions.',
      'Discount write proposals now support BXGY rules, targets, schedules, stacking/tax fields, and automatic discounts scoped to categories or items.',
      'Write tools added for modifier groups, kitchens, extras, smart menu import, coupons, menus, workflows, printers, print settings, users, roles, shifts, and tip distribution.',
      'Manage questions like "tables on Delivery floor" route to list_tables and list_floors instead of reporting-only tools.',
    ],
  },
  {
    date: '2026-08-28',
    title: 'AI assistant CRUD expansion',
    items: [
      'The AI assistant can now propose create/update changes for categories, tables, floors, taxes, order types, payment types, discounts, dish modifiers, dish ingredients, inventory items, scheduled shifts, employees, and departments.',
      'Write tools reuse the same import validation pipeline as AI Import, with permission checks matching each Manage, Inventory, and HR screen.',
      'Inventory and floor write tools require an explicit action verb in the prompt to avoid clashing with read-only inventory questions.',
    ],
  },
  {
    date: '2026-08-28',
    title: 'AI assistant improvements',
    items: [
      'The floating AI assistant now renders markdown tables and lists properly, so sales summaries and order lists are easy to read.',
      'Expand the assistant panel from the header to view wide tables and long answers more comfortably.',
      'The assistant sends only relevant tools per question to reduce token usage and improve response speed.',
      'Write proposal previews are now generic and ready for more Manage entities beyond dishes.',
      'The assistant now uses the same Kashif reporting persona and domain-aware prompts as AI Report, with a lightweight compact mode for everyday questions.',
      'Assistant conversations are saved per user in IndexedDB on this device and survive page reloads until server persistence is added.',
    ],
  },
  {
    date: '2026-08-28',
    title: 'Faster AI Import review for large menus',
    items: [
      'The AI Import review grid now virtualizes rows with TanStack Virtual, so large menu imports stay responsive while you edit cells.',
      'Cell edits update only the changed row instead of re-rendering the entire grid, reducing input lag on big payloads.',
      'Filter buttons let you show all, valid, or invalid rows only, and invalid cells now use a red border instead of blue.',
      'Fixed review grid scroll jitter by using stable row heights and transform-based virtual row positioning.',
    ],
  },
  {
    date: '2026-08-27',
    title: 'Safer Size groups in menu structure AI Import',
    items: [
      'AI Import Menu Structure keeps a distinct Size modifier group per size price matrix (e.g. Size – Classic vs Size – Crust).',
      'Re-importing a second menu with different M/L/F/P prices no longer overwrites an existing Size group; a new unique group name is allocated instead.',
      'OCR is guided with known Size groups and instructed not to model per-dish size prices as nested Size groups.',
    ],
  },
  {
    date: '2026-08-26',
    title: 'Smarter inventory item AI Import',
    items: [
      'Inventory item AI Import now auto-corrects related data when the input is close but not exact (for example "Main store" → "Main"), and shows a review warning so you can confirm or override.',
      'Units of measure are normalized to the standard list (KG, G, L, ML, PC, DZN, PK), including common synonyms like kilogram or pcs.',
      'OCR extraction is guided with known categories, locations, suppliers, and allowed UOMs so the model prefers real catalog values.',
    ],
  },
  {
    date: '2026-08-26',
    title: 'Smart menu AI import for modifiers',
    items: [
      'Dishes → AI Import Menu Structure extracts size price matrices and extras from menu images into dishes, Size groups, dish links, and nested topping price overrides.',
      'Modifier group AI Import now suggests Size / Extra Topping group names and lets you create or pick existing modifier dishes in review.',
      'Dish↔modifier-group AI Import defaults Size-like groups to required (1) and auto-open.',
    ],
  },
  {
    date: '2026-08-25',
    title: 'Faster initial load',
    items: [
      'Non-core screens (Inventory, Settings, Admin, HR, Accounts, Reports, Delivery, Closing, and more) now lazy-load so the first visit downloads a much smaller main bundle.',
      'Purchase document OCR upload was removed; use AI Import on the purchase form instead.',
      'Validation standardized on yup; icons on FontAwesome. Heavy libraries (PDF export, Stripe/PayPal, Swiper) load only when needed.',
    ],
  },
  {
    date: '2026-08-22',
    title: 'Orders defaults and performance',
    items: [
      'Orders screen defaults to In Progress when no status filter is selected.',
      'Orders list loads faster with a date-range filter, a 500-row cap, longer live refresh debounce, and database indexes on order status and created_at.',
      'Orders list loads a light snapshot first, then hydrates card details as orders scroll into view; full order data loads only for pay, print, split, cancel, or refund.',
      'Orders filter data (floors, tables, order types, taxes) comes from the browser cache; taxes are included when reloading cache.',
      'Build-time VITE_TRACKING_ENABLED can disable activity / order tracking posts (on by default).',
      'Build-time VITE_PROTECT_MODULES_SOURCE=server|memory chooses whether protectAction reads modules from the database or the in-memory login user (server by default).',
    ],
  },
  {
    date: '2026-08-19',
    title: 'Auth gateway on by default',
    items: [
      'Login and database traffic go through the auth gateway (port 3142) by default, so Surreal root credentials are not shipped in the browser bundle.',
      'Copy .env.example files for a local-dev JWT secret and Surreal user; change them before any non-localhost deploy. Sidecars require a session JWT.',
    ],
  },
  {
    date: '2026-08-19',
    title: 'Order receipt report',
    items: [
      'Reports → Orders → Order Receipt shows a printable receipt for a single order, with items, totals, and Print / PDF / Image.',
      'In AI Report, invoice numbers and order IDs open that receipt in a new tab; Order Life Cycle also has a View receipt link.',
    ],
  },
  {
    date: '2026-08-18',
    title: 'AI Import for inventory, Manage, and attendance',
    items: [
      'AI Import is available on inventory suppliers, item categories, and locations, so you can create, update, or upsert master data from CSV, Excel, PDF, or images.',
      'Manage lists now include AI Import for floors, modifier groups, taxes, order types, payment types, extras, and kitchens (payment types skip gateway secrets).',
      'HR Attendance can bulk-import clock-in/out records; imported punches stay pending until a manager approves them for payroll.',
    ],
  },
  {
    date: '2026-08-18',
    title: 'Flexible payroll by hours, days, or salary',
    items: [
      'Pay profiles now honor hourly, daily wage, or a flat period amount (monthly, weekly, or contract) in payroll runs, so staff can mix pay types in one restaurant.',
      'Daily and salaried profiles can set expected work days and work weekdays; approved paid leave counts as paid, and unpaid leave prorates or reduces paid days.',
      'Managers can edit preview snapshot lines (days, pay, deductions) with an override note; recalculate keeps those lines unless you reset overrides.',
    ],
  },
  {
    date: '2026-08-18',
    title: 'AI inventory and staff need forecasts',
    items: [
      'Ask AI how much inventory you need this Friday or for the next several days: it compares last same-weekday usage, current stock, holidays, weather, and any local event you mention in the prompt, then suggests purchase quantities (it does not create a purchase order).',
      'Ask how many staff you need for a named day or the coming days to see recommended hours and headcount versus last same weekday and the published schedule.',
    ],
  },
  {
    date: '2026-08-18',
    title: 'Print schedule roster',
    items: [
      'Print a weekly staff roster of scheduled shifts from HR → Scheduling (Assigned shifts or a schedule row) and from Reports → Labor → Schedule roster.',
      'The roster shows employees as rows and Monday–Sunday as columns, with Print, PDF, and Excel from the report toolbar.',
    ],
  },
  {  date: '2026-08-17',
    title: 'AI Import',
    items: [
      'Smart Import is now labeled AI Import, with a two-star sparkles icon on import buttons.',
      'Dish ingredient import accepts dish name or number, and ingredient name or code/number.',
      'Dish ingredient import now includes an optional visible UOM column so recipe quantities are easier to enter without affecting the import result.',
      'AI Import now supports create, update, and upsert modes on all import screens — including document lines, dish ingredients, modifier groups, kitchen reconciliation, and HR scheduled shifts.',
    ],
  },
  {
    date: '2026-08-16',
    title: 'AI order dossier',
    items: [
      'Ask AI for everything about a specific order (by id, number, or invoice) to get dishes, voids, discounts, taxes, payments, kitchen, refunds, merge/split, fiscal submissions, bill prints, tracking, and a timeline in one dossier.',
    ],
  },
  {
    date: '2026-08-15',
    title: 'End-user guides for Login and Settings',
    items: [
      'PDF and screenshot user guides for Login (PIN and form) and Settings are generated under docs/user-guide (regenerate with npm run docs:guide).',
      'Guides include multi-language prose for all app languages and reusable Playwright capture scripts for highlighted field screenshots.',
    ],
  },
  {
    date: '2026-08-15',
    title: 'Smart Import rollout',
    items: [
      'Smart Import is available across master data (categories, tables, dishes, ingredients, modifier groups, inventory items, chart of accounts), inventory document lines, kitchen reconciliation, journal entries, and HR scheduled shifts.',
      'Document imports fill lines on the open form so you can review and save as usual; uploads still support CSV, Excel, PDF, images, and clipboard paste.',
      'Dishes Smart Import (replaces CSV Import) extracts structured rows with AI/OCR when needed and lets you review and edit them before create/update/upsert.',
      'On the upload step, paste with Ctrl+V / Cmd+V to import a file, image, or Excel/Sheets cell range from the clipboard.',
    ],
  },
  {
    date: '2026-08-11',
    title: 'Dish recipe costs and inventory dates',
    items: [
      'Dish recipe lines auto-fill unit cost when selecting an inventory item, show UOM, and display a quantity × unit cost total.',
      'Inventory document created_at uses the app timezone (and wall-clock time when the document date is today), so dates no longer appear one day earlier than posted_at.',
      'Waste and purchase returns pick items from a selected store with current stock; waste can include expired lots when expiry tracking is on.',
      'Unified store inventory history shows document to/from references (invoice, supplier, transfer locations, and more).',
    ],
  },
  {
    date: '2026-08-09',
    title: 'Payment type discounts in one place',
    items: [
      'Bank and card payment promos are configured on discounts (payment types target), not on payment type records.',
      'Selecting a payment type at pay time applies matching automatic discounts through the discount engine.',
    ],
  },
  {
    date: '2026-08-08',
    title: 'Event Logger integration',
    items: [
      'New Event Logger provider logs all integration events to the browser console by default, or to an HTTP API with bearer, API key, basic, or JWT authentication.',
    ],
  },
  {
    date: '2026-08-08',
    title: 'Integration event emission',
    items: [
      'Domain operations now publish integration events (sales, payments, inventory, HR, accounts, and master-data EntityChanged) so future providers and a logger can plug in without rewiring POS screens.',
      'IntegrationManager fans out only to enabled providers that declare an event (or *), isolates handler failures, and emits ApplicationStarted/ApplicationShutdown on bootstrap.',
    ],
  },
  {
    date: '2026-08-08',
    title: 'Integration settings permissions',
    items: [
      'New role modules: Toggle provider, Open configuration, and Save configuration. Enable/disable, opening config, saving settings, and connect/disconnect/sync require those modules (manager PIN when missing).',
    ],
  },
  {
    date: '2026-08-08',
    title: 'All applied discounts on orders and receipts',
    items: [
      'Order cards and bills show every applied discount line, not only the first primary discount.',
    ],
  },
  {
    date: '2026-08-08',
    title: 'Buy X Get Y discount value',
    items: [
      'Buy X Get Y discounts now include a get value field for percent or fixed-amount offers (for example 50% off the second item).',
    ],
  },
  {
    date: '2026-08-07',
    title: 'Fiscal provider logos on receipts',
    items: [
      'Upload a receipt logo in FBR/PRA integration settings; it prints above the fiscal QR on final receipts (stacked lines).',
      'Store logo and header/footer images print as a centered 150×150 box with no stretch; JPEG/PNG decoding is more reliable.',
    ],
  },
  {
    date: '2026-08-06',
    title: 'Menu dish number search',
    items: [
      'Optional dish search on the POS menu (Settings → Items visibility): enable search, choose number-only or name+number, and show or hide dish numbers on tiles.',
      'Full QWERTY keyboard with digit keys sits under the dish grid; results filter live across all menu dishes as you type.',
    ],
  },
  {
    date: '2026-08-06',
    title: 'Copy KOT print with permission',
    items: [
      'Print a KOT copy from the orders screen (in progress and paid orders), routed to each kitchen\'s printers.',
      'Re-print KOT on the kitchen board and copy KOT from orders now require the Print KOT copy permission (manager PIN when missing).',
    ],
  },
  {
    date: '2026-08-06',
    title: 'Kitchen board: grouped addons, denser grid, voice alerts',
    items: [
      'Kitchen tickets for the same order group together; addon fires appear as sections under the original ticket with ADDON labels.',
      'Tickets wrap in a denser multi-column grid instead of one fixed-width column each.',
      'New orders and addons are highlighted and spoken aloud so kitchen staff notice changes without watching the screen constantly.',
    ],
  },
  {
    date: '2026-08-06',
    title: 'Safer order invoice and auto ID allocation',
    items: [
      'Invoice numbers and auto IDs are allocated with an atomic database counter so double-clicks or multiple tabs cannot create two orders with the same numbers.',
      'POS send/pay buttons block re-entry immediately while an order create is already in flight.',
    ],
  },
  {
    date: '2026-08-05',
    title: 'Floor bill amount and cart tax previews',
    items: [
      'Occupied floor tables now show the full bill amount including tax, discounts, service charge, extras, and tips.',
      'Before an order is created, the cart shows a projected total for each configured tax (e.g. Total with GST 8%).',
    ],
  },
  {
    date: '2026-08-04',
    title: 'Sales Summary 2 enhancements',
    items: [
      'Sales Summary 2 now includes a Sale by Employees section with the same metrics as order type and day part breakdowns.',
      'Turn time is calculated as the average minutes between order time (created_at) and completion time (completed_at).',
    ],
  },
  {
    date: '2026-08-03',
    title: 'QuickBooks Online Integration',
    items: [
      'Connect your QuickBooks Online company via OAuth and sync sales, payments, customers, and refunds automatically.',
      'Post inventory, payroll, and waste events as QuickBooks journal entries from your configured chart of accounts.',
      'Import your QuickBooks chart of accounts, customers, vendors, tax codes, and payment methods in one click.',
      'Built on the shared integrations framework — works alongside internal accounting and ready for future providers like Xero.',
    ],
  },
  {
    date: '2026-07-30',
    title: 'Inventory dashboard issuance date filters',
    items: [
      'Issuance and other ledger movements now match report date filters correctly (business_date no longer compared to full date-times).',
      'Dashboard document KPIs (issues, purchases, etc.) use app-timezone datetime bounds so “Today” includes local-midnight documents.',
    ],
  },
  {
    date: '2026-07-30',
    title: 'Inventory ledger business date timezone',
    items: [
      'Ledger business_date now uses the app timezone instead of UTC, so issuance and other movements no longer appear one day behind created_at.',
      'Existing ledger rows are corrected by migration backfill 2026_07_30_ledger_business_date_tz.',
    ],
  },
  {
    date: '2026-07-30',
    title: 'Inventory dashboard refresh',
    items: [
      'Inventory dashboard covers transfers, production, buffet, adjustments, stock value, and below-reorder alerts.',
      'Issuance vs theoretical consumption (recipe × paid sales) is shown by item for the selected period.',
      'Today’s sales/inventory pulse, projected inventory needed for today, and sales-based runout forecast are included.',
    ],
  },
  {
    date: '2026-07-28',
    title: 'Kitchen reconciliation revision details',
    items: [
      'Click a revision in kitchen reconciliation history to open a modal with who changed it, snapshots, and field-level diffs.',
    ],
  },
  {
    date: '2026-07-28',
    title: 'Keyboard navigation in count grids',
    items: [
      'Kitchen reconciliation and buffet closing grids support Ctrl/Cmd + arrow keys to move between editable cells.',
    ],
  },
  {
    date: '2026-07-28',
    title: 'Kitchen reconciliation theoretical consumption',
    items: [
      'Theoretical (system) consumption is restored: sold dishes for the location’s linked POS kitchen are exploded via recipes into ingredient quantities for the business-date window.',
      'Reconciliation stock identity remains location (opening, issued, transfers). If a location has no linked kitchen, generate still works and theoretical stays 0.',
    ],
  },
  {
    date: '2026-07-28',
    title: 'Kitchen reconciliation by location',
    items: [
      'Kitchen reconciliation is keyed by inventory location: generate, load, discard, opening, issued, and transfers use location only.',
      'Reconciliation headers store location; reports and dashboard show location.',
      'Run schema migration 2026_07_28_kitchen_reconciliation_location. Older kitchen-keyed reconciliations are not backfilled.',
    ],
  },
  {
    date: '2026-07-28',
    title: 'Location-first inventory cutover',
    items: [
      'Inventory operations (purchases, returns, issues, issue returns, adjustments, transfers, production, buffet) save and display location instead of store/kitchen.',
      'Inventory dashboard, summary, and reports filter and show location.',
      'No inventory backfill — older store-only rows may show a blank location until edited.',
    ],
  },
  {
    date: '2026-07-28',
    title: 'Kitchen reconciliation generate fix',
    items: [
      'Generate Reconciliation no longer hangs: paid-order consumption uses indexed datetime filters, and missed-day stubs no longer re-scan sales for every skipped day.',
      'Generate also avoids loading dish photo blobs and nested order subqueries that could freeze large databases.',
      'Fixed hang after revision insert: revision snapshots no longer embed every line item (huge websocket payloads), and line reload uses a light item meta query.',
      'Fixed Surreal hang from bare record ids (recordToString stripped table prefixes); all binds now use full table:id via toQueryRecordId.',
      'Missed-day backfill for Generate is header-only (no per-day line inserts), so generating today after a date gap no longer freezes.',
    ],
  },
  {
    date: '2026-07-27',
    title: 'Currency symbol display',
    items: [
      'Settings → Currency symbol lets you show or hide the currency symbol next to amounts on screen and on printed receipts independently.',
    ],
  },
  {
    date: '2026-07-27',
    title: 'FBR/PRA line ItemCode and ItemName',
    items: [
      'Fiscal invoice lines now include compulsory ItemCode (dish number) and ItemName so FBR/PRA no longer reject posts with “Item Code/Name is required”.',
    ],
  },
  {
    date: '2026-07-26',
    title: 'Order fiscal report',
    items: [
      'New Order Fiscal report (Reports → Orders) lists FBR/PRA fiscal invoice submissions per order with provider, fiscal invoice number, status, QR availability and errors.',
      'Filter by date range, fiscal provider, and submission status, with summaries by provider and by status.',
    ],
  },
  {
    date: '2026-07-26',
    title: 'Fiscal invoice API proxy',
    items: [
      'FBR/PRA fiscal invoice submission is proxied through the API server so the browser no longer calls authority URLs directly (fixes CORS failures at settlement).',
    ],
  },
  {
    date: '2026-07-26',
    title: 'Hierarchical permissions and Manage hardening',
    items: [
      'Role permissions now use stable hierarchical IDs (section.resource.action), so the same label in Reports vs Inventory/Summary/Settings no longer share one grant.',
      'Manage (Admin) create, update, delete, and import actions require their own permissions (e.g. admin.dishes.create) — tab access alone is no longer enough.',
      'Existing roles are remapped by the access-modules backfill (view only for Admin resources). Review roles and assign create/update/delete/import where staff should keep editing Manage data.',
    ],
  },
  {
    date: '2026-07-25',
    title: 'CSV import create, update, upsert',
    items: [
      'CSV import for dishes, categories, tables, inventory items, and accounts supports Create, Update, and Upsert modes.',
      'Choose match columns in a multi-select; update/upsert find existing rows by those fields and merge or insert accordingly.',
      'CSV imports are limited to a configurable max size (VITE_MAX_CSV_UPLOAD_BYTES, default 2 MB); other uploads use VITE_MAX_UPLOAD_BYTES (default 500 KB).',
    ],
  },
  {
    date: '2026-07-25',
    title: 'Correct wall-clock times',
    items: [
      'Timestamps now use the system wall clock (Luxon) instead of a monotonic clock that could drift hours behind after long sessions or device sleep.',
      'KOT, bills, refunds, and other receipts format times in the app timezone (VITE_APP_TIMEZONE) so printed times match the POS.',
    ],
  },
  {
    date: '2026-07-25',
    title: 'Role modules view',
    items: [
      'Admin → Users → Roles shows a modules count instead of tagging every permission on the table.',
      'Click the count to open a searchable modal with modules grouped by area.',
    ],
  },
  {
    date: '2026-07-24',
    title: 'Bill print tracking and copies',
    items: [
      'Temp and final bill prints are tracked per order; a print icon marks orders that already had a temp bill.',
      'Settings → Print options (beside printers) sets copies per print type and max temp/final attempts (0 = unlimited).',
      'Exceeding the attempt limit requires manager approval via Override print limit. The unused Prints field was removed from the printer form.',
    ],
  },
  {
    date: '2026-07-24',
    title: 'Consumption vs issuance',
    items: [
      'Consumption report and AI Report now use recipe ingredient qty × sold (Paid) dishes — not inventory issuance.',
      'AI can query issuance separately via get_issuance; Sale vs Consumption compares sales, recipe consumption, issuance, and purchases.',
    ],
  },
  {
    date: '2026-07-24',
    title: 'AI usage limits',
    items: [
      'AI Report completions can be capped per day and per month via AI_DAILY_LIMIT / AI_MONTHLY_LIMIT on the api service (VPS installs).',
      'Set AI_ENABLED=false to hard-block AI. Leave limits unset for unlimited use (typical for local installs with a customer-owned key).',
      'AI Report shows remaining quota when limits are configured and clear errors when disabled or over quota.',
    ],
  },
  {
    date: '2026-07-24',
    title: 'Purchase order report and pricing',
    items: [
      'New Purchase Order report under Reports → Inventory with date, status, supplier, item, and created-by filters.',
      'Creating a purchase order now shows previous purchase price per item and auto-fills the line price (last purchase, then catalog cost).',
      'AI Report can answer purchase order questions via the new get_purchase_orders tool (separate from ledger purchase movements).',
    ],
  },
  {
    date: '2026-07-24',
    title: 'Inventory list totals',
    items: [
      'Purchase orders, purchases, returns, issues, issue returns, waste, and adjustments list tables now show document totals matching receipt amounts.',
    ],
  },
  {
    date: '2026-07-24',
    title: 'Current Inventory ledger posting',
    items: [
      'Purchase returns, issue returns, and waste now post to the inventory ledger so Current Inventory updates immediately.',
      'Production batches post production_input / production_output ledger rows; buffet close and kitchen verification post their waste documents to the ledger.',
      'Re-run the inventory ledger backfill script if older returns, waste, production, or buffet movements still show unchanged quantities.',
    ],
  },
  {
    date: '2026-07-23',
    title: 'Purchase order approval',
    items: [
      'Purchase orders now start as Draft, then Submit for approval → Approved (or Reject back to Draft).',
      'Only Approved purchase orders can be used when creating a purchase; fulfillment still marks the PO Fulfilled.',
      'New protected module Approve Purchase Orders controls who can approve or reject submitted POs (grant under Admin → Roles).',
      'Existing Pending purchase orders are migrated to Approved so they remain usable for purchase.',
    ],
  },
  {
    date: '2026-07-23',
    title: 'Stock transfers update location quantities',
    items: [
      'Stock transfers now post transfer_out / transfer_in ledger rows so Current Inventory decreases at the source location and increases at the destination.',
      'Re-run the inventory ledger backfill script if older location-based transfers still show unchanged quantities.',
    ],
  },
  {
    date: '2026-07-23',
    title: 'Gateway auth stability',
    items: [
      'Fixed Reports opening in a new tab under gateway auth (session tokens are shared across tabs; Login no longer redirect-loops).',
      'Database queries wait while Surreal is connecting and stay quiet when there is no POS session, so integrations no longer spam errors on the login screen.',
      'Gateway mode refreshes expired Surreal DB tokens automatically (or returns to login if the POS session is gone).',
    ],
  },
  {
    date: '2026-07-22',
    title: 'Inventory print pages and report polish',
    items: [
      'Inventory receipts open on a dedicated print URL so they can be linked from purchase, issue, and waste reports.',
      'Tax report shows tax percent alongside tax amount.',
      'Accounts reports and journal entry date filters use Ant Design date-time pickers.',
      'Current inventory detail modal shows item name/code for ledger movements.',
    ],
  },
  {
    date: '2026-07-22',
    title: 'Optional auth gateway',
    items: [
      'Optional auth gateway keeps Surreal root credentials off the browser when VITE_GATEWAY_AUTH is enabled.',
      'Payment, print, tracking, and API sidecars can require a POS session JWT; payment webhooks fail closed unless signatures verify (or an explicit unsigned opt-in).',
      'Legacy direct-Surreal mode remains available via feature flags for rollback.',
    ],
  },
  {
    date: '2026-07-22',
    title: 'Auto lock, logout, and clock-out',
    items: [
      'Settings → Session security: per-user idle timeout that locks or logs out after inactivity (choose one action).',
      'Settings → Auto clock-out: global policy to clock out at shift end (scheduled shift preferred, else assigned shift) and/or a fixed daily time.',
    ],
  },
  {
    date: '2026-07-21',
    title: 'System printers for shared terminals',
    items: [
      'Settings → Printers: assign system printers on this browser/terminal and switch to use them instead of per-user printers for temp, final, refund, and summary.',
      'Delivery print still uses user or global settings so shared terminals do not override delivery routing.',
    ],
  },
  {
    date: '2026-07-21',
    title: 'Browser tab titles',
    items: [
      'Browser tabs now show the current screen and sub-screen name (e.g. Purchases | Inventory).',
    ],
  },
  {
    date: '2026-07-21',
    title: 'Forms, time pickers, and tooltips',
    items: [
      'Form inputs now keep values when editing records (react-hook-form Controller wiring).',
      'Time fields use the Ant Design TimePicker instead of the native browser control.',
      'Icon-only action buttons show localized tooltips and accessible labels.',
      'CSV import modals can export current records in the same template format for edit-and-reimport.',
    ],
  },
  {
    date: '2026-07-20',
    title: 'Inventory location posting',
    items: [
      'Re-print KOT from the kitchen screen when a ticket is missed.',
      'Final bills print QR codes from all successful fiscal providers (e.g. FBR and PRA), each with its authority label.',
      'Fixed inventory posting when purchases or issues still reference stores or kitchens — they now resolve to stock locations.',
      'Clearer errors when a document line is missing a location or an inventory transaction fails.',
      'Fixed purchase extras field schema for landed cost and other purchase metadata.',
    ],
  },
  {
    date: '2026-07-19',
    title: 'Welcome to POSR',
    items: [
      'Added change log component, can be viewed again from settings.',
      '** AI Report now available to test via Reports > AI > AI Report',
      'Updated inventory operations. Merged stores and kitchens into locations.',
      'Fixed Inventory > Adjustments',
      'Added landed cost in purchase.',
      'Bill receipts can now be translated into selected language.',
      'Fixed a bug in integration.',
      'Closing now hides system payments and allows to print after day closing.'
    ],
  }
];

export const getLatestRelease = (): ReleaseNotes | undefined => RELEASES[0];

/** Date of the newest release — used to decide when to auto-open What's New. */
export const LATEST_RELEASE_DATE = getLatestRelease()?.date ?? '';
