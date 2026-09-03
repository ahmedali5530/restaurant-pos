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

/**
 * Internal inventory provider (Phase 10).
 * Subscribes to inventory ledger lifecycle events so Accounting/Reporting
 * can consume them with zero coupling to inventory document forms.
 */
const schema: ProviderConfigurationSchema = {
  sections: [
    {
      id: 'logging',
      title: 'Event handling',
      description: 'Internal inventory event sink. Extend later for stock alerts or external WMS.',
      fields: [
        {
          key: 'logEvents',
          label: 'Log inventory events',
          type: 'switch',
          defaultValue: true,
          helpText: 'When on, InventoryPosted / Reversed / Adjusted events are logged.',
        },
      ],
    },
  ],
};

const manifest: ProviderManifest = {
  id: 'provider:internal-inventory',
  name: 'internal-inventory',
  displayName: 'Internal Inventory',
  category: 'inventory',
  version: '1.0.0',
  providerVersion: '1.0.0',
  minimumFrameworkVersion: '1.0.0',
  supportedFeatures: ['inventoryEvents'],
  supportedEvents: [
    'InventoryPosted',
    'InventoryReversed',
    'InventoryAdjusted',
    'InventoryDocumentAdjusted',
    'PurchaseReceived',
    'PurchaseReturned',
    'WasteRecorded',
    'InventoryTransferred',
    'ProductionCompleted',
    'StockCountCompleted',
  ],
  offlineSupport: true,
  requiresInternet: false,
  requiresAuthentication: false,
  authenticationType: 'none',
  supportsQueue: false,
  supportsRetry: false,
  supportsWebhooks: false,
  supportsCertificates: false,
  supportsBackgroundJobs: false,
  configurationSchema: schema,
};

export class InternalInventoryProvider implements IntegrationProvider {
  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}

  getManifest(): ProviderManifest {
    return manifest;
  }

  getConfigurationSchema(): ProviderConfigurationSchema {
    return schema;
  }

  getCapabilities(): ProviderCapability[] {
    return ['events', 'configuration', 'health'];
  }

  supports(capability: ProviderCapability): boolean {
    return this.getCapabilities().includes(capability);
  }

  async validate(): Promise<{ valid: boolean; errors?: string[] }> {
    return { valid: true };
  }

  async healthCheck(): Promise<IntegrationHealthSnapshot> {
    return {
      providerId: manifest.id,
      status: 'connected',
      authenticationStatus: 'valid',
      averageResponseTimeMs: 5,
      pendingJobs: 0,
      failedJobs: 0,
      lastSynchronization: toJsDate(nowSurrealDateTime()).toISOString(),
      version: manifest.providerVersion,
    };
  }

  async subscribeEvents(): Promise<string[]> {
    return manifest.supportedEvents;
  }

  async handleEvent(event: IntegrationEvent<any>): Promise<void> {
    if (!manifest.supportedEvents.includes(String(event.name))) {
      return;
    }
    console.info(`[InternalInventoryProvider] ${event.name}`, event.payload);
  }

  async execute(
    _request: IntegrationExecutionRequest,
    _context: ProviderExecutionContext
  ): Promise<IntegrationExecutionResponse> {
    return {
      success: true,
      status: 'completed',
      providerId: manifest.id,
    };
  }
}
