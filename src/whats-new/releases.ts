export interface ReleaseNotes {
  date: string
  title?: string
  items: string[]
}

/** Newest-first release notes shown in the What's New dialog. */
export const RELEASES: ReleaseNotes[] = [
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
