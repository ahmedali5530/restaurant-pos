import { IntegrationProvider, ProviderExecutionContext } from '@/integrations/core/provider.ts';
import {
  IntegrationEvent,
  IntegrationExecutionRequest,
  IntegrationExecutionResponse,
  IntegrationHealthSnapshot,
  ProviderCapability,
  ProviderConfigurationSchema,
  ProviderManifest,
} from '@/integrations/core/types.ts';
import { nowSurrealDateTime, toJsDate } from '@/lib/datetime.ts';
import { accountingPostingEngine } from '@/integrations/accounting/posting-engine.ts';
import {
  parseInternalAccountingConfig,
  validateSaleAccountMapping,
} from '@/integrations/accounting/mapping/account-mapping.ts';
import { JournalDraftRequest } from '@/integrations/accounting/types.ts';
import {
  createJournalFromDraft,
  JournalDbClient,
} from '@/integrations/storage/account-journal-repository.ts';

export type AccountingConfigLoader = () => Promise<Record<string, unknown>>;
export type AccountingDbLoader = () => JournalDbClient;
export type AccountingJobEnqueuer = (
  request: IntegrationExecutionRequest
) => Promise<unknown>;

const schema: ProviderConfigurationSchema = {
  sections: [
    {
      id: 'posting',
      title: 'Posting',
      description: 'Draft-first by default. Auto publish posts journals without accountant review.',
      fields: [
        {
          key: 'autoPublish',
          label: 'Auto Publish',
          type: 'switch',
          defaultValue: false,
          helpText: 'When off (default), generated journals stay draft until an accountant publishes them.',
        },
        {
          key: 'postingMode',
          label: 'Posting Mode',
          type: 'dropdown',
          defaultValue: 'draft',
          options: [
            { label: 'Draft (pending review)', value: 'draft' },
            { label: 'Auto publish', value: 'auto_publish' },
          ],
        },
        {
          key: 'postingFrequency',
          label: 'Posting Frequency',
          type: 'dropdown',
          defaultValue: 'immediate',
          options: [
            { label: 'Immediate', value: 'immediate' },
            { label: 'Hourly', value: 'hourly' },
            { label: 'Daily', value: 'daily' },
          ],
          helpText: 'Reserved for future batch posting. Phase 1 always posts immediately to the queue.',
        },
      ],
    },
    {
      id: 'accounts',
      title: 'Account Mapping',
      description: 'Map logical accounting roles to your chart of accounts.',
      fields: [
        { key: 'SALES_REVENUE', label: 'Sales Revenue', type: 'account', required: true },
        { key: 'VAT_OUTPUT', label: 'VAT / Tax Payable', type: 'account' },
        { key: 'DISCOUNT', label: 'Discount', type: 'account' },
        { key: 'TIPS', label: 'Tips', type: 'account' },
        { key: 'CASH_MAIN', label: 'Cash', type: 'account', required: true },
        { key: 'CARD_RECEIVABLE', label: 'Card Receivable', type: 'account', required: true },
        { key: 'OTHER_RECEIVABLE', label: 'Other Receivable', type: 'account' },
        { key: 'INVENTORY', label: 'Inventory', type: 'account' },
        { key: 'COGS', label: 'Cost of Goods Sold', type: 'account' },
        { key: 'PAYROLL_EXPENSE', label: 'Payroll Expense', type: 'account' },
        { key: 'PAYROLL_LIABILITY', label: 'Payroll Liability', type: 'account' },
      ],
    },
  ],
};

const manifest: ProviderManifest = {
  id: 'provider:internal-accounting',
  name: 'internal-accounting',
  displayName: 'Internal Accounting',
  category: 'accounting',
  version: '1.0.0',
  providerVersion: '1.0.0',
  minimumFrameworkVersion: '1.0.0',
  supportedFeatures: ['postJournal', 'draftFirst'],
  supportedEvents: [
    'SaleCompleted',
    'SaleRefunded',
    'InvoicePaid',
    'InvoiceVoided',
    'PurchaseReceived',
    'PurchaseReturned',
    'ExpenseApproved',
    'ExpensePaid',
    'PayrollPosted',
    'WasteRecorded',
    'InventoryAdjusted',
    'InventoryPosted',
    'InventoryReversed',
    'StockCountCompleted',
    'InventoryTransferred',
    'ProductionCompleted',
    'GiftCardIssued',
    'GiftCardRedeemed',
    'LoyaltyRedeemed',
    'CustomerPaymentReceived',
    'SupplierPaymentMade',
    'ShiftClosed',
    'DayClosed',
  ],
  offlineSupport: true,
  requiresInternet: false,
  requiresAuthentication: false,
  authenticationType: 'none',
  supportsQueue: true,
  supportsRetry: true,
  supportsWebhooks: false,
  supportsCertificates: false,
  supportsBackgroundJobs: true,
  configurationSchema: schema,
};

const isJournalDraftRequest = (value: unknown): value is JournalDraftRequest => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const draft = value as JournalDraftRequest;
  return (
    typeof draft.idempotencyKey === 'string' &&
    Array.isArray(draft.lines) &&
    typeof draft.originEvent === 'string'
  );
};

export class InternalAccountingProvider implements IntegrationProvider {
  private getConfig: AccountingConfigLoader = async () => ({});
  private getDb: AccountingDbLoader | null = null;
  private enqueueJob: AccountingJobEnqueuer | null = null;

  setConfigLoader(loader: AccountingConfigLoader) {
    this.getConfig = loader;
  }

  setDbLoader(loader: AccountingDbLoader) {
    this.getDb = loader;
  }

  setJobEnqueuer(enqueuer: AccountingJobEnqueuer) {
    this.enqueueJob = enqueuer;
  }

  async initialize() {}
  async shutdown() {}

  getManifest() {
    return manifest;
  }

  getConfigurationSchema() {
    return schema;
  }

  getCapabilities(): ProviderCapability[] {
    return ['execute', 'events', 'queue', 'retry', 'configuration', 'health'];
  }

  supports(capability: ProviderCapability) {
    return this.getCapabilities().includes(capability);
  }

  async validate() {
    const config = parseInternalAccountingConfig(await this.getConfig());
    const mapping = validateSaleAccountMapping(config.accounts);
    if (!mapping.valid) {
      return { valid: false, errors: mapping.errors };
    }
    return { valid: true };
  }

  async healthCheck(): Promise<IntegrationHealthSnapshot> {
    const validation = await this.validate();
    return {
      providerId: manifest.id,
      status: validation.valid ? 'connected' : 'disconnected',
      authenticationStatus: 'valid',
      averageResponseTimeMs: 20,
      pendingJobs: 0,
      failedJobs: 0,
      lastSynchronization: toJsDate(nowSurrealDateTime()).toISOString(),
      version: manifest.providerVersion,
      updatedAt: toJsDate(nowSurrealDateTime()).toISOString(),
      errors: validation.errors,
    };
  }

  async subscribeEvents(): Promise<string[]> {
    return manifest.supportedEvents;
  }

  async handleEvent(event: IntegrationEvent<any>): Promise<void> {
    if (!manifest.supportedEvents.includes(String(event.name))) {
      return;
    }

    const config = parseInternalAccountingConfig(await this.getConfig());
    const sink = this.enqueueJob
      ? this.enqueueJob
      : async (request: IntegrationExecutionRequest) =>
          this.execute(request, {
            providerId: manifest.id,
            now: nowSurrealDateTime(),
          });

    const result = await accountingPostingEngine.process(
      event,
      config,
      manifest.id,
      sink
    );

    if (result.error) {
      console.warn(
        `[InternalAccountingProvider] Failed processing ${event.name}:`,
        result.error
      );
    }
  }

  async execute(
    request: IntegrationExecutionRequest,
    _context: ProviderExecutionContext
  ): Promise<IntegrationExecutionResponse> {
    if (request.action !== 'postJournal') {
      return {
        success: false,
        status: 'failed',
        providerId: manifest.id,
        error: `Unsupported action "${request.action}"`,
        retriable: false,
      };
    }

    if (!this.getDb) {
      return {
        success: false,
        status: 'failed',
        providerId: manifest.id,
        error: 'Database loader is not configured',
        retriable: true,
      };
    }

    const draft = request.payload as unknown;
    if (!isJournalDraftRequest(draft)) {
      return {
        success: false,
        status: 'failed',
        providerId: manifest.id,
        error: 'Invalid postJournal payload',
        retriable: false,
      };
    }

    try {
      const result = await createJournalFromDraft(this.getDb(), draft);
      return {
        success: true,
        status: 'completed',
        providerId: manifest.id,
        data: result,
      };
    } catch (error: any) {
      return {
        success: false,
        status: 'failed',
        providerId: manifest.id,
        error: error?.message ?? 'Failed to save journal entry',
        retriable: true,
      };
    }
  }
}
