export interface ReleaseNotes {
  date: string
  title?: string
  items: string[]
}

/** Newest-first release notes shown in the What's New dialog. */
export const RELEASES: ReleaseNotes[] = [
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
