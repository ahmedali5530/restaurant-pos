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
import { TransportRouter } from '@/integrations/transport/router.ts';
import { Tables } from '@/api/db/tables.ts';
import { EntityMappingRepository } from '@/integrations/accounting/external/entity-mapping-repository.ts';
import { FiscalConfigLoader } from '@/integrations/providers/fiscal/shared/runtime-config.ts';
import {
  kraTenantId,
  parseKraProviderConfig,
} from '@/integrations/providers/fiscal/kra/config.ts';
import { callKraApi, isKraSuccess } from '@/integrations/providers/fiscal/kra/client.ts';
import { serializeKraItemSave } from '@/integrations/providers/fiscal/kra/serialize-item.ts';
import {
  mapInventoryReferenceToKraStockTy,
} from '@/integrations/providers/fiscal/kra/serialize-stock.ts';
import {
  allocateKraItemCode,
  KraDbClient,
  KRA_PROVIDER_ID,
  submitKraFiscalRequest,
  submitKraStockIo,
} from '@/integrations/providers/fiscal/kra/submit.ts';
import { recordIdToString } from '@/api/reports/shared/records.ts';

const schema: ProviderConfigurationSchema = {
  sections: [
    {
      id: 'connection',
      title: 'Connection',
      fields: [
        {
          key: 'mode',
          label: 'eTIMS Mode',
          type: 'dropdown',
          required: true,
          defaultValue: 'oscu',
          options: [
            { label: 'OSCU (KRA cloud API)', value: 'oscu' },
            { label: 'VSCU (local control unit)', value: 'vscu' },
          ],
          helpText: 'OSCU calls etims-api.kra.go.ke; VSCU calls a local JAR on your server.',
        },
        {
          key: 'apiBaseUrl',
          label: 'API Base URL',
          type: 'text',
          required: true,
          defaultValue: 'https://etims-api-sbx.kra.go.ke/etims-api',
          helpText:
            'OSCU sandbox: https://etims-api-sbx.kra.go.ke/etims-api — production: https://etims-api.kra.go.ke/etims-api — VSCU: http://127.0.0.1:8088',
        },
      ],
    },
    {
      id: 'credentials',
      title: 'Credentials',
      fields: [
        { key: 'tin', label: 'Taxpayer PIN (TIN)', type: 'text', required: true },
        {
          key: 'bhfId',
          label: 'Branch ID',
          type: 'text',
          required: true,
          defaultValue: '00',
          helpText: 'Exactly 2 characters (e.g. 00 for HQ).',
        },
        {
          key: 'dvcSrlNo',
          label: 'Device Serial Number',
          type: 'text',
          required: true,
        },
        {
          key: 'cmcKey',
          label: 'Communication Key',
          type: 'password',
          required: false,
          encrypted: true,
          helpText: 'Filled automatically by Initialize Device.',
        },
        { key: 'sdcId', label: 'SDC ID', type: 'text', required: false },
        { key: 'mrcNo', label: 'MRC Number', type: 'text', required: false },
        { key: 'dvcId', label: 'Device ID', type: 'text', required: false },
      ],
    },
    {
      id: 'fiscal',
      title: 'Fiscal Defaults',
      fields: [
        {
          key: 'itemClsCd',
          label: 'Default Item Classification Code',
          type: 'text',
          required: true,
          helpText: '10-digit KRA item class code used when a dish has no override.',
        },
        {
          key: 'taxTyCd',
          label: 'Default Tax Type',
          type: 'dropdown',
          required: true,
          defaultValue: 'B',
          options: [
            { label: 'A — Exempt / zero', value: 'A' },
            { label: 'B — Standard VAT', value: 'B' },
            { label: 'C', value: 'C' },
            { label: 'D', value: 'D' },
            { label: 'E — Reduced', value: 'E' },
          ],
        },
        {
          key: 'zeroTaxTyCd',
          label: 'Zero-rate Tax Type',
          type: 'dropdown',
          defaultValue: 'A',
          options: [
            { label: 'A', value: 'A' },
            { label: 'C', value: 'C' },
            { label: 'D', value: 'D' },
          ],
        },
        { key: 'pkgUnitCd', label: 'Packaging Unit', type: 'text', defaultValue: 'NT' },
        { key: 'qtyUnitCd', label: 'Quantity Unit', type: 'text', defaultValue: 'U' },
        { key: 'orgnNatCd', label: 'Origin Country', type: 'text', defaultValue: 'KE' },
        {
          key: 'itemTyCd',
          label: 'Item Type Code',
          type: 'dropdown',
          defaultValue: '2',
          options: [
            { label: '1 — Raw material', value: '1' },
            { label: '2 — Finished product', value: '2' },
            { label: '3 — Service', value: '3' },
          ],
        },
        {
          key: 'receiptVerifyBaseUrl',
          label: 'Receipt Verify Base URL',
          type: 'text',
          defaultValue:
            'https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData',
        },
      ],
    },
    {
      id: 'receipt',
      title: 'Receipt',
      fields: [
        {
          key: 'receiptLogo',
          label: 'Receipt Logo',
          type: 'image',
          required: false,
          helpText: 'Printed beside the fiscal QR on receipts (100×100).',
        },
      ],
    },
    {
      id: 'runtime',
      title: 'Runtime',
      fields: [
        { key: 'offlineBuffering', label: 'Offline Buffering', type: 'switch', defaultValue: true },
        {
          key: 'requestTimeoutSeconds',
          label: 'Request Timeout (seconds)',
          type: 'number',
          defaultValue: 30,
        },
        {
          key: 'blockSettlementOnFailure',
          label: 'Block Settlement On Failure',
          type: 'switch',
          defaultValue: false,
        },
        {
          key: 'qrPriority',
          label: 'QR Print Priority',
          type: 'number',
          defaultValue: 50,
          helpText: 'Higher priority prints first when multiple fiscal providers return a QR.',
        },
      ],
    },
  ],
};

const manifest: ProviderManifest = {
  id: KRA_PROVIDER_ID,
  name: 'kra',
  displayName: 'KRA eTIMS Fiscalization',
  category: 'fiscal',
  version: '1.0.0',
  providerVersion: '1.0.0',
  minimumFrameworkVersion: '1.0.0',
  country: 'KE',
  authority: 'KRA',
  supportedFeatures: ['invoiceSubmission', 'creditNote', 'deviceInit', 'itemSync', 'stockIo'],
  supportedEvents: [
    'InventoryPosted',
    'InventoryReversed',
    'SaleRefunded',
    'OrderCancelled',
  ],
  offlineSupport: true,
  requiresInternet: true,
  requiresAuthentication: true,
  authenticationType: 'apiKey',
  supportsQueue: true,
  supportsRetry: true,
  supportsWebhooks: false,
  supportsCertificates: false,
  supportsBackgroundJobs: true,
  configurationSchema: schema,
};

export class KraProvider implements IntegrationProvider {
  private getConfig: FiscalConfigLoader = async () => ({});
  private saveConfig: (values: Record<string, unknown>) => Promise<void> = async () => {};
  private getDb: () => KraDbClient | null = () => null;
  private enqueueJob:
    | ((request: IntegrationExecutionRequest) => Promise<unknown>)
    | null = null;
  private transport = new TransportRouter();

  setConfigLoader(loader: FiscalConfigLoader) {
    this.getConfig = loader;
  }

  setConfigSaver(saver: (values: Record<string, unknown>) => Promise<void>) {
    this.saveConfig = saver;
  }

  setDbLoader(loader: () => KraDbClient) {
    this.getDb = () => {
      try {
        return loader();
      } catch {
        return null;
      }
    };
  }

  setJobEnqueuer(enqueuer: (request: IntegrationExecutionRequest) => Promise<unknown>) {
    this.enqueueJob = enqueuer;
  }

  setTransport(router: TransportRouter) {
    this.transport = router;
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
    return ['execute', 'health', 'queue', 'retry', 'configuration', 'events', 'sync'];
  }
  supports(capability: ProviderCapability) {
    return this.getCapabilities().includes(capability);
  }

  async validate() {
    const config = await this.getConfig();
    const parsed = parseKraProviderConfig(config, { requireCmcKey: false });
    if ('error' in parsed) {
      return { valid: false, errors: [parsed.error] };
    }
    return { valid: true };
  }

  async healthCheck(): Promise<IntegrationHealthSnapshot> {
    const config = await this.getConfig();
    const parsed = parseKraProviderConfig(config, { requireCmcKey: false });
    const hasKey = !('error' in parsed) && Boolean(parsed.cmcKey);
    return {
      providerId: manifest.id,
      status: hasKey ? 'connected' : 'disconnected',
      authenticationStatus: hasKey ? 'valid' : 'invalid',
      averageResponseTimeMs: 200,
      pendingJobs: 0,
      failedJobs: 0,
      lastSynchronization: toJsDate(nowSurrealDateTime()).toISOString(),
      version: manifest.providerVersion,
      updatedAt: toJsDate(nowSurrealDateTime()).toISOString(),
      errors: 'error' in parsed ? [parsed.error] : hasKey ? undefined : ['cmcKey missing — initialize device'],
    };
  }

  /** Device initialization — stores cmcKey / sdcId / mrcNo / dvcId. */
  async connect(): Promise<void> {
    const raw = await this.getConfig();
    const parsed = parseKraProviderConfig(raw, { requireCmcKey: false });
    if ('error' in parsed) {
      throw new Error(parsed.error);
    }

    const payload = {
      tin: parsed.tin,
      bhfId: parsed.bhfId,
      dvcSrlNo: parsed.dvcSrlNo,
    };
    const result = await callKraApi(parsed, 'init', payload, this.transport);
    if (!result.ok || !isKraSuccess(result.body)) {
      throw new Error(result.error || result.body.resultMsg || 'KRA device init failed');
    }

    const info = result.body.data?.info ?? result.body.data ?? {};
    const next = {
      ...raw,
      cmcKey: String(info.cmcKey ?? raw.cmcKey ?? ''),
      sdcId: String(info.sdcId ?? info.sdicId ?? raw.sdcId ?? ''),
      mrcNo: String(info.mrcNo ?? raw.mrcNo ?? ''),
      dvcId: String(info.dvcId ?? raw.dvcId ?? ''),
    };
    if (!next.cmcKey) {
      throw new Error('KRA init succeeded but cmcKey was empty');
    }
    await this.saveConfig(next);
  }

  async disconnect(): Promise<void> {
    const raw = await this.getConfig();
    await this.saveConfig({
      ...raw,
      cmcKey: '',
      sdcId: '',
      mrcNo: '',
      dvcId: '',
    });
  }

  /** Register unmapped dishes and inventory items with KRA. */
  async sync(): Promise<void> {
    const raw = await this.getConfig();
    const parsed = parseKraProviderConfig(raw);
    if ('error' in parsed) throw new Error(parsed.error);

    const db = this.getDb();
    if (!db) throw new Error('Database is not available');

    const repo = new EntityMappingRepository(db);
    const tenantId = kraTenantId(parsed);
    const existing = await repo.listByProvider(KRA_PROVIDER_ID, tenantId, 'item');
    const mapped = new Set(existing.map((row) => String(row.posrId)));

    const [dishes] = await db.query<
      Array<{
        id: string;
        name?: string;
        number?: string;
        price?: number;
        barcode?: string;
        kra_item_cls_cd?: string;
        kra_tax_ty_cd?: string;
      }>
    >(
      `SELECT id, name, number, price, barcode, kra_item_cls_cd, kra_tax_ty_cd
       FROM ${Tables.dishes}
       WHERE deleted_at = NONE
       LIMIT 5000`
    );

    const [inventoryItems] = await db.query<
      Array<{ id: string; name?: string; cost?: number; barcode?: string }>
    >(
      `SELECT id, name, cost, barcode
       FROM ${Tables.inventory_items}
       WHERE deleted_at = NONE
       LIMIT 5000`
    );

    const candidates: Array<{
      posrId: string;
      name: string;
      price: number;
      barcode?: string | null;
      itemClsCd?: string | null;
      taxTyCd?: string | null;
      itemTyCd?: string;
    }> = [];

    const dishRows = Array.isArray(dishes) ? dishes : [];
    for (const dish of dishRows) {
      const id = String(dish.id);
      if (mapped.has(id)) continue;
      candidates.push({
        posrId: id,
        name: String(dish.name || dish.number || 'Dish'),
        price: Number(dish.price) || 0,
        barcode: dish.barcode,
        itemClsCd: dish.kra_item_cls_cd,
        taxTyCd: dish.kra_tax_ty_cd,
        itemTyCd: '2',
      });
    }

    const inventoryRows = Array.isArray(inventoryItems) ? inventoryItems : [];
    for (const item of inventoryRows) {
      const id = String(item.id);
      if (mapped.has(id)) continue;
      candidates.push({
        posrId: id,
        name: String(item.name || 'Item'),
        price: Number(item.cost) || 0,
        barcode: item.barcode,
        itemTyCd: '1',
      });
    }

    for (const candidate of candidates) {
      const itemCd = await allocateKraItemCode(db, parsed);
      const payload = serializeKraItemSave(parsed, {
        itemCd,
        itemNm: candidate.name,
        itemClsCd: candidate.itemClsCd,
        taxTyCd: candidate.taxTyCd,
        barcode: candidate.barcode,
        price: candidate.price,
        itemTyCd: candidate.itemTyCd,
      });
      const result = await callKraApi(parsed, 'saveItem', payload, this.transport);
      if (!result.ok || !isKraSuccess(result.body)) {
        throw new Error(
          result.error ||
            result.body.resultMsg ||
            `Failed registering item ${candidate.name}`
        );
      }
      await repo.save({
        providerId: KRA_PROVIDER_ID,
        tenantId,
        entityType: 'item',
        posrId: candidate.posrId,
        externalId: itemCd,
        externalPayload: { itemClsCd: candidate.itemClsCd || parsed.itemClsCd },
      });
    }
  }

  async execute(
    request: IntegrationExecutionRequest,
    _context: ProviderExecutionContext
  ): Promise<IntegrationExecutionResponse> {
    return submitKraFiscalRequest(request, this.getConfig, this.getDb, this.transport);
  }

  async handleEvent(event: IntegrationEvent<any>): Promise<void> {
    if (event.name === 'SaleRefunded') {
      await this.handleSaleRefunded(event);
      return;
    }
    if (event.name === 'OrderCancelled') {
      await this.handleOrderCancelled(event);
      return;
    }
    if (event.name === 'InventoryPosted' || event.name === 'InventoryReversed') {
      await this.handleInventoryStock(event);
    }
  }

  private async handleSaleRefunded(event: IntegrationEvent<any>) {
    const payload = event.payload ?? {};
    const orderId = String(payload.orderId ?? payload.order?.id ?? '');
    const refundId = String(payload.refundId ?? '');
    if (!orderId) return;

    const db = this.getDb();
    if (!db) return;

    const [orderRows] = await db.query<any[]>(
      `SELECT * FROM ONLY ${orderId}
       FETCH items, items.item, payments, payments.payment_type, customer, tax`
    );
    const order = Array.isArray(orderRows) ? orderRows[0] : orderRows;
    if (!order) return;

    const request: IntegrationExecutionRequest = {
      action: 'creditNote',
      payload: {
        order,
        itemIds: payload.itemIds,
        reasonCode: '06',
        refundId,
      },
      idempotencyKey: `fiscal-credit:${orderId}:${refundId || 'refund'}:${KRA_PROVIDER_ID}`,
    };

    if (this.enqueueJob) {
      await this.enqueueJob(request);
    } else {
      await this.execute(request, {
        providerId: KRA_PROVIDER_ID,
        now: nowSurrealDateTime(),
      });
    }
  }

  private async handleOrderCancelled(event: IntegrationEvent<any>) {
    const payload = event.payload ?? {};
    const orderId = String(payload.orderId ?? payload.order?.id ?? '');
    if (!orderId) return;
    // Only paid voids produce a KRA credit note (publisher already gates on Paid).
    const voidBatchKey = String(payload.voidBatchKey ?? payload.batchKey ?? 'void');

    const db = this.getDb();
    if (!db) return;

    const [orderRows] = await db.query<any[]>(
      `SELECT * FROM ONLY ${orderId}
       FETCH items, items.item, payments, payments.payment_type, customer, tax`
    );
    const order = Array.isArray(orderRows) ? orderRows[0] : orderRows;
    if (!order) return;

    const request: IntegrationExecutionRequest = {
      action: 'creditNote',
      payload: {
        order,
        reasonCode: '06',
        voidBatchKey,
      },
      idempotencyKey: `fiscal-credit:${orderId}:${voidBatchKey}:${KRA_PROVIDER_ID}`,
    };

    if (this.enqueueJob) {
      await this.enqueueJob(request);
    } else {
      await this.execute(request, {
        providerId: KRA_PROVIDER_ID,
        now: nowSurrealDateTime(),
      });
    }
  }

  private async handleInventoryStock(event: IntegrationEvent<any>) {
    const payload = event.payload ?? {};
    const referenceType = String(payload.referenceType ?? '');
    const referenceId = String(payload.referenceId ?? '');
    if (!referenceType || !referenceId) return;

    const stockTyCd = mapInventoryReferenceToKraStockTy(referenceType, {
      reversed: event.name === 'InventoryReversed',
    });
    if (!stockTyCd) return;

    const raw = await this.getConfig();
    const parsed = parseKraProviderConfig(raw);
    if ('error' in parsed) return;

    const db = this.getDb();
    if (!db) return;

    const tableByType: Record<string, string> = {
      purchase: Tables.inventory_purchases,
      purchase_return: Tables.inventory_purchase_returns,
      waste: Tables.inventory_wastes,
      adjustment: Tables.inventory_adjustments,
    };
    const table = tableByType[referenceType];
    if (!table) return;

    const id = recordIdToString(referenceId) || referenceId;
    const thing = id.includes(':') ? id : `${table}:${id}`;
    const [doc] = await db.query<any[]>(
      `SELECT * FROM ONLY ${thing} FETCH items, items.item`
    );
    const document = Array.isArray(doc) ? doc[0] : doc;
    if (!document?.items?.length) return;

    const repo = new EntityMappingRepository(db);
    const tenantId = kraTenantId(parsed);
    const lines: Array<{
      itemCd: string;
      itemNm: string;
      qty: number;
      unitPrice?: number;
    }> = [];

    for (const line of document.items) {
      const item = line.item;
      const itemId = String(typeof item === 'object' ? item?.id : item ?? '');
      if (!itemId) continue;
      const mapping = await repo.findByPosrId(KRA_PROVIDER_ID, tenantId, 'item', itemId);
      if (!mapping?.externalId) continue;
      const qty = Math.abs(Number(line.quantity) || 0);
      if (qty <= 0) continue;
      lines.push({
        itemCd: String(mapping.externalId),
        itemNm: String(
          (typeof item === 'object' && item?.name) || line.name || mapping.externalId
        ),
        qty,
        unitPrice: Number(line.unit_cost ?? line.cost ?? item?.cost ?? 0) || 0,
      });
    }

    if (!lines.length) return;

    // For adjustments, refine in/out from signed quantities when available.
    let finalStockTy = stockTyCd;
    if (referenceType === 'adjustment') {
      const signed = Number(document.items?.[0]?.quantity);
      const refined = mapInventoryReferenceToKraStockTy(referenceType, {
        reversed: event.name === 'InventoryReversed',
        signedQty: signed,
      });
      if (refined) finalStockTy = refined;
    }

    const result = await submitKraStockIo(parsed, db, this.transport, {
      stockTyCd: finalStockTy,
      lines,
    });

    if (!result.success && this.enqueueJob) {
      await this.enqueueJob({
        action: 'stockIo',
        payload: { stockTyCd: finalStockTy, lines },
        idempotencyKey: `kra-stock:${referenceType}:${referenceId}:${event.name}`,
      });
    }
  }
}
