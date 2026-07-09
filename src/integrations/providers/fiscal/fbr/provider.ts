import { IntegrationProvider, ProviderExecutionContext } from '@/integrations/core/provider.ts';
import {
  IntegrationExecutionRequest,
  IntegrationExecutionResponse,
  IntegrationHealthSnapshot,
  ProviderCapability,
  ProviderConfigurationSchema,
  ProviderManifest,
} from '@/integrations/core/types.ts';
import { nowSurrealDateTime, toJsDate, toSurrealDateTime } from '@/lib/datetime.ts';

const schema: ProviderConfigurationSchema = {
  sections: [
    {
      id: 'credentials',
      title: 'Credentials',
      fields: [
        { key: 'apiBaseUrl', label: 'API Base URL', type: 'text', required: true },
        { key: 'apiKey', label: 'API Key', type: 'password', required: true, encrypted: true },
        { key: 'sellerNtn', label: 'Seller NTN', type: 'text', required: true },
      ],
    },
    {
      id: 'runtime',
      title: 'Runtime',
      fields: [
        { key: 'offlineBuffering', label: 'Offline Buffering', type: 'switch', defaultValue: true },
        { key: 'requestTimeoutSeconds', label: 'Request Timeout (seconds)', type: 'number', defaultValue: 30 },
      ],
    },
  ],
};

const manifest: ProviderManifest = {
  id: 'provider:fbr',
  name: 'fbr',
  displayName: 'FBR Fiscalization',
  category: 'fiscal',
  version: '1.0.0',
  providerVersion: '1.0.0',
  minimumFrameworkVersion: '1.0.0',
  country: 'PK',
  authority: 'FBR',
  supportedFeatures: ['invoiceSubmission', 'invoiceVoid'],
  supportedEvents: ['InvoiceCreated', 'InvoiceVoided'],
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

export class FbrProvider implements IntegrationProvider {
  async initialize() {}
  async shutdown() {}
  getManifest() {
    return manifest;
  }
  getConfigurationSchema() {
    return schema;
  }
  getCapabilities(): ProviderCapability[] {
    return ['execute', 'health', 'queue', 'retry', 'configuration', 'events'];
  }
  supports(capability: ProviderCapability) {
    return this.getCapabilities().includes(capability);
  }
  async validate() {
    return { valid: true };
  }
  async healthCheck(): Promise<IntegrationHealthSnapshot> {
    return {
      providerId: manifest.id,
      status: 'connected',
      authenticationStatus: 'valid',
      averageResponseTimeMs: 150,
      pendingJobs: 0,
      failedJobs: 0,
      lastSynchronization: toJsDate(nowSurrealDateTime()).toISOString(),
      version: manifest.providerVersion,
      updatedAt: toJsDate(nowSurrealDateTime()).toISOString(),
    };
  }
  async execute(
    request: IntegrationExecutionRequest,
    _context: ProviderExecutionContext
  ): Promise<IntegrationExecutionResponse> {
    return {
      success: true,
      status: 'accepted',
      providerId: manifest.id,
      requestId: `${manifest.id}:${request.action}:${Date.now()}`,
      data: {
        action: request.action,
        acceptedOffline: true,
      },
    };
  }
}
