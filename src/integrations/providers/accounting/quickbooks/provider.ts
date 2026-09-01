import { IntegrationProvider, ProviderExecutionContext } from '@/integrations/core/provider.ts';
import {
  IntegrationEvent,
  IntegrationExecutionRequest,
  IntegrationExecutionResponse,
  IntegrationHealthSnapshot,
  ProviderCapability,
  ProviderConfigurationSchema,
} from '@/integrations/core/types.ts';
import { QBO_MANIFEST, QBO_SCHEMA } from '@/integrations/providers/accounting/quickbooks/manifest.ts';
import { parseQuickBooksConfig, QuickBooksConfig } from '@/integrations/providers/accounting/quickbooks/config.ts';
import { EntityMappingRepository } from '@/integrations/accounting/external/entity-mapping-repository.ts';
import { routeExternalAccountingEvent } from '@/integrations/accounting/external/event-router.ts';
import { SyncOrchestrator } from '@/integrations/accounting/external/sync-orchestration.ts';
import { categorizeExternalError, isRetriableExternalError } from '@/integrations/accounting/external/errors.ts';
import { accountingPostingEngine } from '@/integrations/accounting/posting-engine.ts';
import {
  AccountingRemoteAdapter,
  MasterDataImport,
  ChangeSet,
  ExternalAccountingConfig,
} from '@/integrations/accounting/external/types.ts';
import { nowSurrealDateTime, toJsDate } from '@/lib/datetime.ts';
import { Tables } from '@/api/db/tables.ts';
import {
  getConnectionStatus,
  proxyQboRequest,
  refreshToken,
} from '@/integrations/providers/accounting/quickbooks/client-bridge.ts';

export type QuickBooksConfigLoader = () => Promise<Record<string, unknown>>;
export type QuickBooksDbClient = EntityMappingRepository['db'];

/**
 * QuickBooks Online accounting provider.
 * Implements IntegrationProvider and delegates all QBO-specific logic
 * through a remote adapter that talks to the API proxy.
 */
export class QuickBooksProvider implements IntegrationProvider {
  private getConfig: QuickBooksConfigLoader = async () => ({});
  private getDb: QuickBooksDbClient | null = null;
  private mappingRepo: EntityMappingRepository | null = null;
  private syncOrch: SyncOrchestrator | null = null;
  private saveConfig: ((values: Record<string, unknown>) => Promise<void>) | null = null;

  setConfigLoader(loader: QuickBooksConfigLoader) {
    this.getConfig = loader;
  }

  setConfigSaver(saver: (values: Record<string, unknown>) => Promise<void>) {
    this.saveConfig = saver;
  }

  setDbLoader(loader: () => QuickBooksDbClient) {
    this.getDb = loader();
    this.mappingRepo = new EntityMappingRepository(this.getDb);
    this.syncOrch = new SyncOrchestrator(
      this.getDb,
      this.mappingRepo,
      this.adapter,
      QBO_MANIFEST.id
    );
  }

  setJobEnqueuer(enqueuer: (request: IntegrationExecutionRequest) => Promise<unknown>) {
    this.enqueueJob = enqueuer;
  }

  private enqueueJob: ((request: IntegrationExecutionRequest) => Promise<unknown>) | null = null;

  /** The adapter that satisfies AccountingRemoteAdapter */
  private readonly adapter: AccountingRemoteAdapter = {
    importMasterData: this.importMasterData.bind(this),
    upsertSale: this.upsertSale.bind(this),
    upsertPayment: this.upsertPayment.bind(this),
    upsertCustomer: this.upsertCustomer.bind(this),
    upsertRefund: this.upsertRefund.bind(this),
    postJournal: this.postJournal.bind(this),
    fetchChanges: this.fetchChanges.bind(this),
    refreshAuth: this.refreshAuth.bind(this),
  };

  async initialize() {}
  async shutdown() {}

  getManifest() {
    return QBO_MANIFEST;
  }

  getConfigurationSchema() {
    return QBO_SCHEMA;
  }

  getCapabilities(): ProviderCapability[] {
    return ['execute', 'sync', 'events', 'queue', 'retry', 'configuration', 'health', 'webhooks'];
  }

  supports(capability: ProviderCapability) {
    return this.getCapabilities().includes(capability);
  }

  async getConfigParsed(): Promise<QuickBooksConfig> {
    return parseQuickBooksConfig(await this.getConfig());
  }

  async validate(): Promise<{ valid: boolean; errors?: string[] }> {
    const config = await this.getConfigParsed();
    const errors: string[] = [];

    if (!config.tenantId) {
      errors.push('Not connected to a QuickBooks company. Use Connect to link an account.');
    }

    // Check required account mappings
    if (!config.accounts.SALES_REVENUE) errors.push('Sales Revenue account mapping is required');
    if (!config.accounts.CASH_MAIN) errors.push('Cash account mapping is required');
    if (!config.accounts.CARD_RECEIVABLE) errors.push('Card Receivable account mapping is required');

    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }

  // --- OAuth ---

  async connect(): Promise<void> {
    const result = await import(
      '@/integrations/providers/accounting/quickbooks/client-bridge.ts'
    ).then((m) => m.startOAuth({ redirectPath: '/integrations' }));
    if (!result?.authorizeUrl) {
      throw new Error('Failed to obtain QuickBooks authorization URL. Check that QBO_CLIENT_ID and QBO_REDIRECT_URI are configured.');
    }
    window.location.href = result.authorizeUrl;
  }

  async disconnect(): Promise<void> {
    const config = await this.getConfigParsed();
    if (config.tenantId) {
      await import(
        '@/integrations/providers/accounting/quickbooks/client-bridge.ts'
      ).then((m) => m.disconnectOAuth(config.tenantId));
    }
  }

  // --- Sync ---

  async sync(): Promise<void> {
    const config = await this.getConfigParsed();
    if (!config.tenantId || !this.syncOrch) return;

    try {
      const result = await this.syncOrch.runInitialSync(config.tenantId);

      // Persist saleItemId and defaultCustomerId directly via SurrealQL
      // (avoids the saveConfig path which relies on db.merge that doesn't exist in surrealdb.js v2)
      if (this.getDb && (result.configUpserts?.saleItemId || result.configUpserts?.defaultCustomerId)) {
        const key = `integration_provider_config:${QBO_MANIFEST.id}`;
        const [rows] = await this.getDb.query<Array<{ id: string }>>(
          `SELECT id FROM setting WHERE key = $key AND is_global = true LIMIT 1`,
          { key }
        );
        const current = await this.getConfig();
        const merged = { ...current, ...result.configUpserts };
        if (rows?.[0]?.id) {
          await this.getDb.query(
            `UPDATE $id MERGE { values: $values }`,
            { id: rows[0].id, values: merged }
          );
        } else {
          await this.getDb.query(
            `CREATE setting CONTENT { key: $key, values: $values, is_global: true }`,
            { key, values: merged }
          );
        }
      }
    } catch (err) {
      console.warn('[QuickBooksProvider] Initial sync failed:', err);
    }
  }

  // --- Health ---

  async healthCheck(): Promise<IntegrationHealthSnapshot> {
    const config = await this.getConfigParsed();
    const validation = await this.validate();

    let connectionStatus: IntegrationHealthSnapshot['status'] = 'disconnected';
    if (config.isConnected && validation.valid) {
      connectionStatus = 'connected';
    } else if (config.isConnected) {
      connectionStatus = 'degraded';
    }

    return {
      providerId: QBO_MANIFEST.id,
      status: connectionStatus,
      authenticationStatus: config.isConnected ? 'valid' : 'unknown',
      averageResponseTimeMs: undefined,
      pendingJobs: 0,
      failedJobs: this.syncOrch ? await this.syncOrch.getFailureCount(config.tenantId) : 0,
      lastSynchronization: undefined,
      version: QBO_MANIFEST.providerVersion,
      errors: validation.errors,
      updatedAt: toJsDate(nowSurrealDateTime()).toISOString(),
    };
  }

  // --- Events ---

  async subscribeEvents(): Promise<string[]> {
    return QBO_MANIFEST.supportedEvents;
  }

  async handleEvent(event: IntegrationEvent<any>): Promise<void> {
    if (!QBO_MANIFEST.supportedEvents.includes(String(event.name))) {
      return;
    }

    const config = await this.getConfigParsed();
    if (!config.tenantId || !this.mappingRepo) {
      console.warn('[QuickBooksProvider] Cannot handle event — not connected or missing DB');
      return;
    }

    const sink = this.enqueueJob
      ? this.enqueueJob
      : async (request: IntegrationExecutionRequest) =>
          this.execute(request, { providerId: QBO_MANIFEST.id, now: nowSurrealDateTime() });

    const enqueueFn = async (action: string, payload: Record<string, unknown>, idempotencyKey?: string) => {
      await sink({ action, payload, idempotencyKey });
    };

    const result = await routeExternalAccountingEvent(
      event,
      QBO_MANIFEST.id,
      this.adapter,
      config,
      this.mappingRepo,
      accountingPostingEngine,
      enqueueFn
    );

    if (result.error) {
      console.warn(`[QuickBooksProvider] Failed routing ${event.name}:`, result.error);
    }
  }

  // --- Execute ---

  async execute(
    request: IntegrationExecutionRequest,
    _context: ProviderExecutionContext
  ): Promise<IntegrationExecutionResponse> {
    const config = await this.getConfigParsed();

    if (!config.tenantId) {
      return {
        success: false,
        status: 'failed',
        providerId: QBO_MANIFEST.id,
        error: 'Not connected to QuickBooks',
        retriable: false,
      };
    }

    try {
      switch (request.action) {
        case 'syncSale':
          return await this.handleSyncSale(config, request);
        case 'syncPayment':
          return await this.handleSyncPayment(config, request);
        case 'syncCustomer':
          return await this.handleSyncCustomer(config, request);
        case 'syncRefund':
          return await this.handleSyncRefund(config, request);
        case 'postExternalJournal':
          return await this.handlePostJournal(config, request);
        case 'initialSync':
          return await this.handleInitialSync(config);
        case 'incrementalSync':
          return await this.handleIncrementalSync(config, request);
        default:
          return {
            success: false,
            status: 'failed',
            providerId: QBO_MANIFEST.id,
            error: `Unsupported action: ${request.action}`,
            retriable: false,
          };
      }
    } catch (err: any) {
      const category = categorizeExternalError(err);
      return {
        success: false,
        status: 'failed',
        providerId: QBO_MANIFEST.id,
        error: err?.message ?? 'Execution failed',
        retriable: isRetriableExternalError(category),
      };
    }
  }

  // --- Action handlers ---

  private async handleSyncSale(config: QuickBooksConfig, request: IntegrationExecutionRequest): Promise<IntegrationExecutionResponse> {
    const payload = request.payload?.eventPayload ?? request.payload ?? {};
    const posrOrderId = String(payload.orderId ?? payload.id ?? '');
    if (!posrOrderId) {
      return { success: false, status: 'failed', providerId: QBO_MANIFEST.id, error: 'Missing order id', retriable: false };
    }

    // Check idempotency
    if (this.mappingRepo) {
      const existing = await this.mappingRepo.findByPosrId(QBO_MANIFEST.id, config.tenantId, 'sales_receipt', posrOrderId);
      if (existing) {
        return { success: true, status: 'completed', providerId: QBO_MANIFEST.id, data: { externalId: existing.externalId } };
      }
    }

    const { externalId } = await this.adapter.upsertSale({ tenantId: config.tenantId, posrOrderId, payload });
    return { success: true, status: 'completed', providerId: QBO_MANIFEST.id, data: { externalId } };
  }

  private async handleSyncPayment(config: QuickBooksConfig, request: IntegrationExecutionRequest): Promise<IntegrationExecutionResponse> {
    const payload = request.payload?.eventPayload ?? request.payload ?? {};
    const posrPaymentId = String(payload.paymentId ?? payload.id ?? '');
    if (!posrPaymentId) {
      return { success: false, status: 'failed', providerId: QBO_MANIFEST.id, error: 'Missing payment id', retriable: false };
    }

    if (this.mappingRepo) {
      const existing = await this.mappingRepo.findByPosrId(QBO_MANIFEST.id, config.tenantId, 'payment', posrPaymentId);
      if (existing) {
        return { success: true, status: 'completed', providerId: QBO_MANIFEST.id, data: { externalId: existing.externalId } };
      }
    }

    const { externalId } = await this.adapter.upsertPayment({ tenantId: config.tenantId, posrPaymentId, payload });
    return { success: true, status: 'completed', providerId: QBO_MANIFEST.id, data: { externalId } };
  }

  private async handleSyncCustomer(config: QuickBooksConfig, request: IntegrationExecutionRequest): Promise<IntegrationExecutionResponse> {
    const payload = request.payload?.eventPayload ?? request.payload ?? {};
    const posrCustomerId = String(payload.customerId ?? payload.id ?? '');
    if (!posrCustomerId) {
      return { success: false, status: 'failed', providerId: QBO_MANIFEST.id, error: 'Missing customer id', retriable: false };
    }

    if (this.mappingRepo) {
      const existing = await this.mappingRepo.findByPosrId(QBO_MANIFEST.id, config.tenantId, 'customer', posrCustomerId);
      if (existing) {
        return { success: true, status: 'completed', providerId: QBO_MANIFEST.id, data: { externalId: existing.externalId } };
      }
    }

    const { externalId } = await this.adapter.upsertCustomer({ tenantId: config.tenantId, posrCustomerId, payload });
    return { success: true, status: 'completed', providerId: QBO_MANIFEST.id, data: { externalId } };
  }

  private async handleSyncRefund(config: QuickBooksConfig, request: IntegrationExecutionRequest): Promise<IntegrationExecutionResponse> {
    const payload = request.payload?.eventPayload ?? request.payload ?? {};
    const posrRefundId = String(payload.refundId ?? payload.id ?? '');
    if (!posrRefundId) {
      return { success: false, status: 'failed', providerId: QBO_MANIFEST.id, error: 'Missing refund id', retriable: false };
    }

    if (this.mappingRepo) {
      const existing = await this.mappingRepo.findByPosrId(QBO_MANIFEST.id, config.tenantId, 'refund_receipt', posrRefundId);
      if (existing) {
        return { success: true, status: 'completed', providerId: QBO_MANIFEST.id, data: { externalId: existing.externalId } };
      }
    }

    const { externalId } = await this.adapter.upsertRefund({ tenantId: config.tenantId, posrRefundId, payload });
    return { success: true, status: 'completed', providerId: QBO_MANIFEST.id, data: { externalId } };
  }

  private async handlePostJournal(config: QuickBooksConfig, request: IntegrationExecutionRequest): Promise<IntegrationExecutionResponse> {
    const payload = request.payload ?? {};
    const id = String(payload.idempotencyKey ?? payload.originEvent ?? payload.originRecordId ?? '');
    if (!id) {
      return { success: false, status: 'failed', providerId: QBO_MANIFEST.id, error: 'Missing journal id', retriable: false };
    }

    if (this.mappingRepo) {
      const existing = await this.mappingRepo.findByPosrId(QBO_MANIFEST.id, config.tenantId, 'journal_entry', id);
      if (existing) {
        return { success: true, status: 'completed', providerId: QBO_MANIFEST.id, data: { externalId: existing.externalId } };
      }
    }

    const { externalId } = await this.adapter.postJournal({ tenantId: config.tenantId, posrJournalId: id, payload: payload as Record<string, unknown> });
    return { success: true, status: 'completed', providerId: QBO_MANIFEST.id, data: { externalId } };
  }

  private async handleInitialSync(config: QuickBooksConfig): Promise<IntegrationExecutionResponse> {
    if (!this.syncOrch) {
      return { success: false, status: 'failed', providerId: QBO_MANIFEST.id, error: 'Sync orchestrator not initialized', retriable: true };
    }
    const result = await this.syncOrch.runInitialSync(config.tenantId);
    return { success: true, status: 'completed', providerId: QBO_MANIFEST.id, data: result };
  }

  private async handleIncrementalSync(config: QuickBooksConfig, request: IntegrationExecutionRequest): Promise<IntegrationExecutionResponse> {
    if (!this.syncOrch) {
      return { success: false, status: 'failed', providerId: QBO_MANIFEST.id, error: 'Sync orchestrator not initialized', retriable: true };
    }
    const cursor = String(request.payload?.cursor ?? '');
    const result = await this.syncOrch.runIncrementalSync(config.tenantId, cursor);
    return { success: true, status: 'completed', providerId: QBO_MANIFEST.id, data: result };
  }

  // --- AccountingRemoteAdapter implementation ---

  private async ensureToken(config: QuickBooksConfig): Promise<void> {
    try {
      await refreshToken(config.tenantId);
    } catch {
      // Token refresh failure handled by proxy on next request
    }
  }

  private async importMasterData(params: { tenantId: string; options?: Record<string, unknown> }): Promise<MasterDataImport> {
    const config = await this.getConfigParsed();
    await this.ensureToken(config);

    // QBO API v3 lists entities via the /query endpoint, not direct entity paths.
    const query = (entityType: string) =>
      proxyQboRequest({
        realmId: params.tenantId,
        method: 'GET',
        path: '/query',
        query: {
          query: `SELECT * FROM ${entityType} STARTPOSITION 1 MAXRESULTS 1000`,
          minorversion: '70',
        },
      });

    const [accountsR, customersR, vendorsR, taxCodesR, paymentMethodsR, itemsR] = await Promise.all([
      query('Account'),
      query('Customer'),
      query('Vendor'),
      query('TaxCode'),
      query('PaymentMethod'),
      query('Item'),
    ]);

    const extract = (response: any, key: string) => response?.QueryResponse?.[key] ?? [];

    const items = extract(itemsR, 'Item') as any[];

    // Find or create a generic "POSR Sale" service item for sales receipts
    let saleItemId: string | undefined;
    const existingSaleItem = items.find(
      (i: any) => i.Name === 'POSR Sale' && (i.Type === 'Service' || i.Type === 'NonInventory')
    );
    if (existingSaleItem) {
      saleItemId = String(existingSaleItem.Id);
    } else {
      try {
        const incomeAccount =
          extract(accountsR, 'Account').find((a: any) => a.AccountType === 'Income')
          ?? extract(accountsR, 'Account')[0];
        const newItem: any = {
          Name: 'POSR Sale',
          Type: 'Service',
          IncomeAccountRef: incomeAccount ? { value: String(incomeAccount.Id) } : undefined,
        };
        const created = await proxyQboRequest({
          realmId: params.tenantId, method: 'POST', path: '/item',
          body: newItem,
        });
        saleItemId = String(created?.Item?.Id ?? '');
        if (saleItemId) {
          items.push({ Id: saleItemId, Name: 'POSR Sale', Type: 'Service' });
        }
      } catch (err) {
        console.warn('[QuickBooksProvider] Failed to create POSR Sale item:', err);
        saleItemId = undefined;
      }
    }

    // Use the first customer as default if none configured
    let defaultCustomerId: string | undefined;
    const customers = extract(customersR, 'Customer');
    if (customers.length > 0) {
      defaultCustomerId = String(customers[0].Id);
    }

    let classes: any[] = [];
    let departments: any[] = [];
    if (config.enableClasses) {
      try {
        const result = await query('Class');
        classes = extract(result, 'Class');
      } catch { /* optional */ }
    }
    if (config.enableDepartments) {
      try {
        const result = await query('Department');
        departments = extract(result, 'Department');
      } catch { /* optional */ }
    }

    return {
      saleItemId,
      defaultCustomerId,
      accounts: extract(accountsR, 'Account').map((a: any) => ({ id: String(a.Id), name: a.Name, code: a.AcctNum, type: a.AccountType, subType: a.AccountSubType })),
      customers: customers.map((c: any) => ({ id: String(c.Id), name: c.DisplayName, email: c.PrimaryEmailAddr?.Address })),
      vendors: extract(vendorsR, 'Vendor').map((v: any) => ({ id: String(v.Id), name: v.DisplayName, email: v.PrimaryEmailAddr?.Address })),
      taxCodes: extract(taxCodesR, 'TaxCode').map((t: any) => ({ id: String(t.Id), name: t.Name, rate: t.TaxRateRefList?.TaxRateDetail?.[0]?.TaxRateRef?.value })),
      paymentMethods: extract(paymentMethodsR, 'PaymentMethod').map((p: any) => ({ id: String(p.Id), name: p.Name })),
      items: items.map((i: any) => ({ id: String(i.Id), name: i.Name, type: i.Type })),
      classes: config.enableClasses ? classes.map((c: any) => ({ id: String(c.Id), name: c.Name })) : undefined,
      departments: config.enableDepartments ? departments.map((d: any) => ({ id: String(d.Id), name: d.Name })) : undefined,
    };
  }

  private async upsertSale(params: { tenantId: string; posrOrderId: string; payload: Record<string, unknown> }): Promise<{ externalId: string }> {
    const config = await this.getConfigParsed();

    // QBO SalesReceipt requires ItemRef on every SalesItemLineDetail line
    const saleItemId = await this.resolveSaleItemId(params.tenantId, config);

    // Extract POSR fields and map to QBO SalesReceipt
    const p = params.payload ?? {};
    const totalAmt = Number(p.totalCollected ?? p.total ?? p.amount ?? 0);
    const txnDate = typeof p.completedAt === 'string' ? p.completedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);

    // Build line items
    const orderItems = Array.isArray(p.items) ? p.items as any[] : [];
    const lines = orderItems.length > 0
      ? orderItems.map((item: any) => ({
          DetailType: 'SalesItemLineDetail',
          Amount: Number(item.price ?? item.amount ?? 0) * Number(item.quantity ?? 1),
          Description: String(item.name ?? item.description ?? 'Item'),
          SalesItemLineDetail: {
            ItemRef: { value: saleItemId },
            Qty: Number(item.quantity ?? 1),
            UnitPrice: Number(item.price ?? item.amount ?? 0),
          },
        }))
      : [{
          DetailType: 'SalesItemLineDetail',
          Amount: totalAmt,
          Description: 'POSR Sale',
          SalesItemLineDetail: {
            ItemRef: { value: saleItemId },
          },
        }];

    // QBO DocNumber max 21 chars — truncate and use short order-id suffix
    const shortOrderId = params.posrOrderId.replace(/^order:/, '').slice(0, 10);
    const docNumber = `POSR-${shortOrderId}`;

    const salePayload: Record<string, unknown> = {
      DocNumber: docNumber,
      TxnDate: txnDate,
      Line: lines,
      TotalAmt: totalAmt,
      PrivateNote: `POSR order ${params.posrOrderId}`,
    };

    // CustomerRef: prefer mapped POSR customer, else config default (dropdown value is already a QBO Id)
    const posrCustomerId = String(p.customerId ?? '');
    let customerExternalId: string | undefined;

    if (posrCustomerId && this.mappingRepo) {
      const customerMapping = await this.mappingRepo.findByPosrId(QBO_MANIFEST.id, params.tenantId, 'customer', posrCustomerId);
      if (customerMapping) customerExternalId = customerMapping.externalId;
    }

    if (!customerExternalId && config.defaultCustomerId) {
      customerExternalId = String(config.defaultCustomerId);
    }

    if (!customerExternalId) {
      try {
        const newCustomer = await this.adapter.upsertCustomer({
          tenantId: params.tenantId,
          posrCustomerId: `guest-${params.posrOrderId}`,
          payload: { displayName: 'POSR Walk-in Customer' },
        });
        customerExternalId = newCustomer.externalId;
      } catch {
        // If we can't create a customer, try without one
      }
    }

    if (customerExternalId) {
      salePayload.CustomerRef = { value: customerExternalId };
    }

    const path = config.saleDocumentType === 'invoice' ? '/invoice' : '/salesreceipt';
    const result = await proxyQboRequest({ realmId: params.tenantId, method: 'POST', path, body: salePayload });
    const externalId = String(result?.SalesReceipt?.Id ?? result?.Invoice?.Id ?? result?.Id ?? '');
    if (externalId && this.mappingRepo) {
      await this.mappingRepo.save({
        providerId: QBO_MANIFEST.id,
        tenantId: params.tenantId,
        entityType: config.saleDocumentType === 'invoice' ? 'invoice' : 'sales_receipt',
        posrId: params.posrOrderId,
        externalId,
        externalPayload: result,
      });
    }
    return { externalId };
  }

  /** Resolve QBO Item id for SalesReceipt lines (config, mapping, or find/create POSR Sale). */
  private async resolveSaleItemId(tenantId: string, config: QuickBooksConfig): Promise<string> {
    if (config.saleItemId) return String(config.saleItemId);

    // Already imported into entity mappings?
    if (this.mappingRepo) {
      try {
        const [rows] = await (this.getDb as any).query(
          `SELECT external_id, external_payload FROM ${Tables.integration_entity_mappings}
           WHERE provider_id = $providerId AND entity_type = 'item' LIMIT 200`,
          { providerId: QBO_MANIFEST.id }
        );
        const items = Array.isArray(rows) ? rows : [];
        const posrSale = items.find((r: any) => r.external_payload?.name === 'POSR Sale');
        if (posrSale?.external_id) {
          await this.persistConfigField('saleItemId', String(posrSale.external_id));
          return String(posrSale.external_id);
        }
        if (items[0]?.external_id) {
          await this.persistConfigField('saleItemId', String(items[0].external_id));
          return String(items[0].external_id);
        }
      } catch { /* fall through to live QBO lookup */ }
    }

    // Live find/create in QBO
    try {
      const itemsR = await proxyQboRequest({
        realmId: tenantId,
        method: 'GET',
        path: '/query',
        query: {
          query: `SELECT * FROM Item STARTPOSITION 1 MAXRESULTS 1000`,
          minorversion: '70',
        },
      });
      const items = itemsR?.QueryResponse?.Item ?? [];
      const existing = items.find((i: any) => i.Name === 'POSR Sale') ?? items[0];
      if (existing?.Id) {
        const id = String(existing.Id);
        await this.persistConfigField('saleItemId', id);
        return id;
      }

      const accountsR = await proxyQboRequest({
        realmId: tenantId,
        method: 'GET',
        path: '/query',
        query: {
          query: `SELECT * FROM Account STARTPOSITION 1 MAXRESULTS 200`,
          minorversion: '70',
        },
      });
      const accounts = accountsR?.QueryResponse?.Account ?? [];
      const incomeAccount = accounts.find((a: any) => a.AccountType === 'Income') ?? accounts[0];
      const created = await proxyQboRequest({
        realmId: tenantId,
        method: 'POST',
        path: '/item',
        body: {
          Name: 'POSR Sale',
          Type: 'Service',
          IncomeAccountRef: incomeAccount ? { value: String(incomeAccount.Id) } : undefined,
        },
      });
      const id = String(created?.Item?.Id ?? '');
      if (!id) throw new Error('Failed to create POSR Sale item in QuickBooks');
      await this.persistConfigField('saleItemId', id);
      if (this.mappingRepo) {
        await this.mappingRepo.save({
          providerId: QBO_MANIFEST.id,
          tenantId,
          entityType: 'item',
          posrId: id,
          externalId: id,
          externalPayload: { name: 'POSR Sale', type: 'Service' },
        });
      }
      return id;
    } catch (err: any) {
      throw new Error(
        err?.message
          ?? 'No sale item configured. Set "Sale Item" in configuration or run Initial Sync.'
      );
    }
  }

  private async persistConfigField(key: string, value: string): Promise<void> {
    if (!this.getDb) return;
    try {
      const settingKey = `integration_provider_config:${QBO_MANIFEST.id}`;
      const [rows] = await this.getDb.query<Array<{ id: string }>>(
        `SELECT id FROM setting WHERE key = $key AND is_global = true LIMIT 1`,
        { key: settingKey }
      );
      const current = await this.getConfig();
      const values = { ...current, [key]: value };
      if (rows?.[0]?.id) {
        await this.getDb.query(
          `UPDATE $id MERGE { values: $values }`,
          { id: rows[0].id, values }
        );
      } else {
        await this.getDb.query(
          `CREATE setting CONTENT { key: $key, values: $values, is_global: true }`,
          { key: settingKey, values }
        );
      }
    } catch (err) {
      console.warn('[QuickBooksProvider] Failed to persist config field', key, err);
    }
  }

  private async upsertPayment(params: { tenantId: string; posrPaymentId: string; payload: Record<string, unknown> }): Promise<{ externalId: string }> {
    const config = await this.getConfigParsed();
    const p = params.payload ?? {};
    const amount = Number(p.amount ?? p.totalCollected ?? p.total ?? 0);
    const txnDate = typeof p.completedAt === 'string' ? p.completedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const orderId = String(p.orderId ?? '');

    // Look up the sale receipt or invoice to link this payment to
    let linkedTxn: { TxnId: string; TxnType: string } | undefined;
    if (orderId && this.mappingRepo) {
      const saleMapping = await this.mappingRepo.findByPosrId(
        QBO_MANIFEST.id, params.tenantId,
        config.saleDocumentType === 'invoice' ? 'invoice' : 'sales_receipt',
        orderId
      );
      if (saleMapping) {
        linkedTxn = { TxnId: saleMapping.externalId, TxnType: config.saleDocumentType === 'invoice' ? 'Invoice' : 'SalesReceipt' };
      }
    }

    const paymentPayload: Record<string, unknown> = {
      TotalAmt: amount,
      TxnDate: txnDate,
      PrivateNote: `POSR payment ${params.posrPaymentId}`,
    };

    if (linkedTxn) {
      paymentPayload.Line = [{
        Amount: amount,
        LinkedTxn: [linkedTxn],
      }];
    }

    const customerId = String(p.customerId ?? '');
    if (customerId && this.mappingRepo) {
      const customerMapping = await this.mappingRepo.findByPosrId(QBO_MANIFEST.id, params.tenantId, 'customer', customerId);
      if (customerMapping) {
        paymentPayload.CustomerRef = { value: customerMapping.externalId };
      }
    }

    const result = await proxyQboRequest({ realmId: params.tenantId, method: 'POST', path: '/payment', body: paymentPayload });
    const externalId = String(result?.Payment?.Id ?? result?.Id ?? '');
    if (externalId && this.mappingRepo) {
      await this.mappingRepo.save({
        providerId: QBO_MANIFEST.id,
        tenantId: params.tenantId,
        entityType: 'payment',
        posrId: params.posrPaymentId,
        externalId,
        externalPayload: result,
      });
    }
    return { externalId };
  }

  private async upsertCustomer(params: { tenantId: string; posrCustomerId: string; payload: Record<string, unknown> }): Promise<{ externalId: string }> {
    const p = params.payload ?? {};
    const displayName = String(p.name ?? p.displayName ?? p.customerName ?? `POSR Customer ${params.posrCustomerId}`);
    const customerPayload: Record<string, unknown> = {
      DisplayName: displayName,
      GivenName: String(p.firstName ?? p.givenName ?? ''),
      FamilyName: String(p.lastName ?? p.familyName ?? ''),
    };
    if (p.email) customerPayload.PrimaryEmailAddr = { Address: String(p.email) };
    if (p.phone) customerPayload.PrimaryPhone = { FreeFormNumber: String(p.phone) };

    const result = await proxyQboRequest({ realmId: params.tenantId, method: 'POST', path: '/customer', body: customerPayload });
    const externalId = String(result?.Customer?.Id ?? result?.Id ?? '');
    if (externalId && this.mappingRepo) {
      await this.mappingRepo.save({
        providerId: QBO_MANIFEST.id,
        tenantId: params.tenantId,
        entityType: 'customer',
        posrId: params.posrCustomerId,
        externalId,
        externalPayload: result,
      });
    }
    return { externalId };
  }

  private async upsertRefund(params: { tenantId: string; posrRefundId: string; payload: Record<string, unknown> }): Promise<{ externalId: string }> {
    const config = await this.getConfigParsed();
    const p = params.payload ?? {};
    const amount = Number(p.amount ?? p.totalRefunded ?? p.totalCollected ?? 0);
    const txnDate = typeof p.completedAt === 'string' ? p.completedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);

    const refundPayload: Record<string, unknown> = {
      TotalAmt: amount,
      TxnDate: txnDate,
      Line: [{ DetailType: 'SalesItemLineDetail', Amount: amount, Description: 'POSR Refund', SalesItemLineDetail: {} }],
      PrivateNote: `POSR refund ${params.posrRefundId}`,
    };

    const result = await proxyQboRequest({ realmId: params.tenantId, method: 'POST', path: '/refundreceipt', body: refundPayload });
    const externalId = String(result?.RefundReceipt?.Id ?? result?.Id ?? '');
    if (externalId && this.mappingRepo) {
      await this.mappingRepo.save({
        providerId: QBO_MANIFEST.id,
        tenantId: params.tenantId,
        entityType: 'refund_receipt',
        posrId: params.posrRefundId,
        externalId,
        externalPayload: result,
      });
    }
    return { externalId };
  }

  private async postJournal(params: { tenantId: string; posrJournalId: string; payload: Record<string, unknown> }): Promise<{ externalId: string }> {
    const result = await proxyQboRequest({ realmId: params.tenantId, method: 'POST', path: '/journalentry', body: params.payload });
    const externalId = String(result?.JournalEntry?.Id ?? result?.Id ?? '');
    if (externalId && this.mappingRepo) {
      await this.mappingRepo.save({
        providerId: QBO_MANIFEST.id,
        tenantId: params.tenantId,
        entityType: 'journal_entry',
        posrId: params.posrJournalId,
        externalId,
        externalPayload: result,
      });
    }
    return { externalId };
  }

  private async fetchChanges(params: { tenantId: string; cursor: string }): Promise<ChangeSet> {
    const entityTypes = ['Account', 'Customer', 'Vendor', 'TaxCode', 'PaymentMethod', 'SalesReceipt', 'Invoice', 'Payment', 'RefundReceipt', 'JournalEntry'];

    const entities: ChangeSet['entities'] = [];

    for (const entityType of entityTypes) {
      const result = await proxyQboRequest({
        realmId: params.tenantId,
        method: 'GET',
        path: '/query',
        query: {
          query: `SELECT * FROM ${entityType} WHERE MetaData.LastUpdatedTime > '${params.cursor}'`,
          minorversion: '70',
        },
      });

      const items = result?.QueryResponse?.[entityType] ?? [];
      for (const item of items) {
        entities.push({
          entityType: entityType.toLowerCase() as any,
          externalId: String(item.Id),
          operation: 'update',
          lastUpdated: item.MetaData?.LastUpdatedTime ?? new Date().toISOString(),
        });
      }
    }

    return { newCursor: new Date().toISOString(), entities };
  }

  private async refreshAuth(tenantId: string): Promise<void> {
    await refreshToken(tenantId);
  }
}
