export interface ReleaseNotes {
  version: string
  date?: string
  title?: string
  items: string[]
}

/** Bump this string on every release. */
export const APP_VERSION = '1.0.7';

/** Newest-first release notes shown in the What's New dialog. */
export const RELEASES: ReleaseNotes[] = [
  {
    version: '1.0.7',
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
    version: '1.0.6',
    date: '2026-07-22',
    title: 'Optional auth gateway',
    items: [
      'Optional auth gateway keeps Surreal root credentials off the browser when VITE_GATEWAY_AUTH is enabled.',
      'Payment, print, tracking, and API sidecars can require a POS session JWT; payment webhooks fail closed unless signatures verify (or an explicit unsigned opt-in).',
      'Legacy direct-Surreal mode remains available via feature flags for rollback.',
    ],
  },
  {
    version: '1.0.5',
    date: '2026-07-22',
    title: 'Auto lock, logout, and clock-out',
    items: [
      'Settings → Session security: per-user idle timeout that locks or logs out after inactivity (choose one action).',
      'Settings → Auto clock-out: global policy to clock out at shift end (scheduled shift preferred, else assigned shift) and/or a fixed daily time.',
    ],
  },
  {
    version: '1.0.4',
    date: '2026-07-21',
    title: 'System printers for shared terminals',
    items: [
      'Settings → Printers: assign system printers on this browser/terminal and switch to use them instead of per-user printers for temp, final, refund, and summary.',
      'Delivery print still uses user or global settings so shared terminals do not override delivery routing.',
    ],
  },
  {
    version: '1.0.3',
    date: '2026-07-21',
    title: 'Browser tab titles',
    items: [
      'Browser tabs now show the current screen and sub-screen name (e.g. Purchases | Inventory).',
    ],
  },
  {
    version: '1.0.2',
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
    version: '1.0.1',
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
    version: '1.0.0',
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

export const getLatestRelease = (): ReleaseNotes | undefined =>
  RELEASES.find((r) => r.version === APP_VERSION) ?? RELEASES[0];
