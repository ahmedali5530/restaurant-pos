export type IntegrationCategory =
  | 'fiscal'
  | 'payment'
  | 'delivery'
  | 'accounting'
  | 'communication'
  | 'loyalty'
  | 'erp'
  | 'ai'
  | 'cloud'
  | 'inventory'
  | 'hardware'
  | 'custom';

export type ProviderConnectionStatus = 'connected' | 'disconnected' | 'degraded';

export type ProviderCapability =
  | 'execute'
  | 'cancel'
  | 'sync'
  | 'retry'
  | 'events'
  | 'webhooks'
  | 'queue'
  | 'scheduler'
  | 'health'
  | 'configuration'
  | 'backgroundJobs'
  | 'certificates';

export type IntegrationEventName =
  | 'ApplicationStarted'
  | 'ApplicationShutdown'
  | 'EntityChanged'
  | 'InvoiceCreated'
  | 'InvoicePaid'
  | 'InvoiceRefunded'
  | 'InvoiceVoided'
  | 'SaleCompleted'
  | 'SaleRefunded'
  | 'PurchaseReceived'
  | 'PurchaseReturned'
  | 'ExpenseApproved'
  | 'ExpensePaid'
  | 'PayrollPosted'
  | 'WasteRecorded'
  | 'InventoryAdjusted'
  /** Ledger lifecycle for adjustment documents (not accounting value event). */
  | 'InventoryDocumentAdjusted'
  | 'InventoryIssued'
  | 'IssueReturned'
  | 'StockCountCompleted'
  | 'InventoryTransferred'
  | 'ProductionCompleted'
  | 'InventoryPosted'
  | 'InventoryReversed'
  | 'GiftCardIssued'
  | 'GiftCardRedeemed'
  | 'LoyaltyRedeemed'
  | 'CustomerPaymentReceived'
  | 'SupplierPaymentMade'
  | 'ShiftOpened'
  | 'ShiftClosed'
  | 'DayClosed'
  | 'OrderCreated'
  | 'OrderCancelled'
  | 'CustomerCreated'
  | 'PaymentCompleted'
  | 'JournalPosted'
  | 'JournalReversed'
  | 'PrinterConnected'
  | 'InternetConnected'
  | 'InternetDisconnected'
  | string;

export interface IntegrationEvent<TPayload = Record<string, unknown>> {
  id: string;
  name: IntegrationEventName;
  occurredAt: string;
  source: string;
  payload: TPayload;
  metadata?: Record<string, unknown>;
}

export interface ProviderManifestFieldOption {
  label: string;
  value: string | number | boolean;
}

export type ProviderManifestFieldType =
  | 'text'
  | 'number'
  | 'password'
  | 'checkbox'
  | 'switch'
  | 'dropdown'
  | 'certificate'
  | 'json'
  | 'dynamic'
  | 'account'
  | 'externalEntity'
  | 'image';

export interface ProviderManifestField {
  key: string;
  label: string;
  type: ProviderManifestFieldType;
  required?: boolean;
  encrypted?: boolean;
  defaultValue?: unknown;
  placeholder?: string;
  helpText?: string;
  entityType?: string;
  options?: ProviderManifestFieldOption[];
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
  };
  dependsOn?: {
    field: string;
    equals: string | number | boolean;
  };
}

export interface ProviderConfigurationSchema {
  sections?: Array<{
    id: string;
    title: string;
    description?: string;
    fields: ProviderManifestField[];
  }>;
  fields?: ProviderManifestField[];
}

export interface ProviderManifest {
  id: string;
  name: string;
  displayName: string;
  category: IntegrationCategory;
  version: string;
  providerVersion: string;
  minimumFrameworkVersion: string;
  country?: string;
  authority?: string;
  supportedFeatures: string[];
  supportedEvents: string[];
  supportedCurrencies?: string[];
  supportedLanguages?: string[];
  offlineSupport: boolean;
  requiresInternet: boolean;
  requiresAuthentication: boolean;
  authenticationType?: 'apiKey' | 'oauth' | 'jwt' | 'bearer' | 'certificate' | 'mtls' | 'none';
  supportsQueue: boolean;
  supportsRetry: boolean;
  supportsWebhooks: boolean;
  supportsCertificates: boolean;
  supportsBackgroundJobs: boolean;
  configurationSchema: ProviderConfigurationSchema;
  settingsUI?: string;
  icon?: string;
  documentation?: string;
}

export interface IntegrationExecutionRequest {
  action: string;
  payload?: Record<string, unknown>;
  context?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface IntegrationExecutionResponse<TData = unknown> {
  success: boolean;
  status: 'accepted' | 'completed' | 'failed' | 'cancelled';
  providerId: string;
  requestId?: string;
  data?: TData;
  error?: string;
  retriable?: boolean;
}

export interface IntegrationHealthSnapshot {
  providerId: string;
  status: ProviderConnectionStatus;
  authenticationStatus: 'valid' | 'expired' | 'invalid' | 'unknown';
  averageResponseTimeMs?: number;
  pendingJobs: number;
  failedJobs: number;
  lastSynchronization?: string;
  certificateExpiry?: string;
  version: string;
  errors?: string[];
  updatedAt: string;
}
