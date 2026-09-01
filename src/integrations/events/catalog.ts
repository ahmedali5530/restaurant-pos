/**
 * Integration event catalog by domain.
 * Typed money/lifecycle events + EntityChanged for master-data logging.
 */
export const INTEGRATION_EVENT_CATALOG = {
  lifecycle: ['ApplicationStarted', 'ApplicationShutdown'] as const,
  entity: ['EntityChanged'] as const,
  sales: [
    'SaleCompleted',
    'SaleRefunded',
    'OrderCreated',
    'OrderCancelled',
    'PaymentCompleted',
    'InvoiceCreated',
    'CustomerCreated',
  ] as const,
  inventory: [
    'PurchaseReceived',
    'PurchaseReturned',
    'WasteRecorded',
    'InventoryAdjusted',
    'InventoryDocumentAdjusted',
    'InventoryIssued',
    'IssueReturned',
    'InventoryTransferred',
    'ProductionCompleted',
    'InventoryPosted',
    'InventoryReversed',
    'StockCountCompleted',
  ] as const,
  hr: ['PayrollPosted'] as const,
  accounts: ['JournalPosted', 'JournalReversed'] as const,
  ops: ['DayClosed', 'ShiftOpened', 'ShiftClosed'] as const,
} as const;

export type EntityDomain = 'manage' | 'hr' | 'inventory' | 'accounts' | 'pos' | 'ops';
