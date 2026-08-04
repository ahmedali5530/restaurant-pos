import { LogicalAccountCode } from '@/integrations/accounting/types.ts';
import { IntegrationExecutionRequest } from '@/integrations/core/types.ts';

/** Provider-agnostic external accounting configuration. */
export interface ExternalAccountingConfig {
  tenantId: string;
  syncDirection: 'posr_to_external' | 'bidirectional';
  syncIntervalMinutes: number;
  saleDocumentType: 'sales_receipt' | 'invoice';
  enableClasses: boolean;
  enableDepartments: boolean;
  enableInventoryJournals: boolean;
  defaultCustomerId?: string;
  defaultRevenueAccount?: string;
  defaultTaxAccount?: string;
  defaultInventoryAccount?: string;
  defaultExpenseAccount?: string;
  /** Logical account codes → external account IDs */
  accounts: Record<LogicalAccountCode, string>;
  /** POSR payment method id → external payment method reference */
  paymentMappings: Record<string, string>;
  /** POSR payment method id → external deposit account ID */
  paymentAccountMappings: Record<string, string>;
}

/** An entity mapping between POSR and an external accounting system. */
export interface EntityMapping {
  id?: string;
  providerId: string;
  tenantId: string;
  entityType: ExternalEntityType;
  posrId: string;
  externalId: string;
  externalPayload?: Record<string, unknown>;
  updatedAt?: string;
}

export type ExternalEntityType =
  | 'account'
  | 'customer'
  | 'vendor'
  | 'tax_code'
  | 'payment_method'
  | 'class'
  | 'department'
  | 'item'
  | 'sales_receipt'
  | 'invoice'
  | 'payment'
  | 'refund_receipt'
  | 'journal_entry'
  | 'credit_memo';

export type SyncMode = 'full' | 'incremental' | 'manual';

export interface SyncRun {
  id?: string;
  providerId: string;
  tenantId: string;
  mode: SyncMode;
  status: SyncRunStatus;
  progress?: string;
  cursor?: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export type SyncRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface SyncFailure {
  id?: string;
  providerId: string;
  tenantId: string;
  entityType: ExternalEntityType;
  posrId: string;
  action: string;
  error: string;
  errorCategory: ExternalErrorCategory;
  retriable: boolean;
  retryCount: number;
  createdAt: string;
}

export type ExternalErrorCategory =
  | 'authentication'
  | 'validation'
  | 'rate_limit'
  | 'network'
  | 'business_logic'
  | 'unknown';

/**
 * Adapter contract that each cloud accounting provider must implement.
 * Shared orchestration calls these methods; QuickBooks and Xero each supply their own.
 */
export interface AccountingRemoteAdapter {
  /** Import master data from the external system. */
  importMasterData(params: { tenantId: string; options?: Record<string, unknown> }): Promise<MasterDataImport>;

  /** Upsert a sale (SalesReceipt or Invoice) to the external system. Returns the external ID. */
  upsertSale(params: {
    tenantId: string;
    posrOrderId: string;
    payload: Record<string, unknown>;
  }): Promise<{ externalId: string }>;

  /** Upsert a payment to the external system. */
  upsertPayment(params: {
    tenantId: string;
    posrPaymentId: string;
    payload: Record<string, unknown>;
  }): Promise<{ externalId: string }>;

  /** Upsert a customer to the external system. */
  upsertCustomer(params: {
    tenantId: string;
    posrCustomerId: string;
    payload: Record<string, unknown>;
  }): Promise<{ externalId: string }>;

  /** Upsert a refund to the external system. */
  upsertRefund(params: {
    tenantId: string;
    posrRefundId: string;
    payload: Record<string, unknown>;
  }): Promise<{ externalId: string }>;

  /** Post a journal entry. */
  postJournal(params: {
    tenantId: string;
    posrJournalId: string;
    payload: Record<string, unknown>;
  }): Promise<{ externalId: string }>;

  /** Fetch changed entities since a cursor for incremental sync. */
  fetchChanges(params: { tenantId: string; cursor: string }): Promise<ChangeSet>;

  /** Refresh authentication credentials. Returns new access token. */
  refreshAuth(tenantId: string): Promise<void>;
}

export interface MasterDataImport {
  saleItemId?: string;
  defaultCustomerId?: string;
  accounts: Array<{ id: string; name: string; code?: string; type?: string; subType?: string }>;
  customers: Array<{ id: string; name: string; email?: string }>;
  vendors: Array<{ id: string; name: string; email?: string }>;
  taxCodes: Array<{ id: string; name: string; rate?: number }>;
  paymentMethods: Array<{ id: string; name: string }>;
  items?: Array<{ id: string; name: string; type?: string }>;
  classes?: Array<{ id: string; name: string }>;
  departments?: Array<{ id: string; name: string }>;
}

export interface ChangeSet {
  newCursor: string;
  entities: Array<{
    entityType: ExternalEntityType;
    externalId: string;
    operation: 'create' | 'update' | 'delete';
    lastUpdated: string;
  }>;
}
