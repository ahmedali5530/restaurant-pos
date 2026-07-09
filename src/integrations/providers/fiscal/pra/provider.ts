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
        { key: 'username', label: 'Username', type: 'text', required: true },
        { key: 'password', label: 'Password', type: 'password', required: true, encrypted: true },
      ],
    },
    {
      id: 'certificates',
      title: 'Certificates',
      fields: [
        { key: 'clientCertificate', label: 'Client Certificate', type: 'certificate', required: false },
      ],
    },
  ],
};

const manifest: ProviderManifest = {
  id: 'provider:pra',
  name: 'pra',
  displayName: 'PRA Fiscalization',
  category: 'fiscal',
  version: '1.0.0',
  providerVersion: '1.0.0',
  minimumFrameworkVersion: '1.0.0',
  country: 'PK',
  authority: 'PRA',
  supportedFeatures: ['invoiceSubmission', 'invoiceVoid', 'healthPing'],
  supportedEvents: ['InvoiceCreated', 'InvoiceVoided'],
  offlineSupport: true,
  requiresInternet: true,
  requiresAuthentication: true,
  authenticationType: 'jwt',
  supportsQueue: true,
  supportsRetry: true,
  supportsWebhooks: false,
  supportsCertificates: true,
  supportsBackgroundJobs: true,
  configurationSchema: schema,
};

export class PraProvider implements IntegrationProvider {
  async initialize() {}
  async shutdown() {}
  getManifest() {
    return manifest;
  }
  getConfigurationSchema() {
    return schema;
  }
  getCapabilities(): ProviderCapability[] {
    return ['execute', 'health', 'queue', 'retry', 'certificates', 'configuration', 'events'];
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
      averageResponseTimeMs: 180,
      pendingJobs: 0,
      failedJobs: 0,
      lastSynchronization: toJsDate(nowSurrealDateTime()).toISOString(),
      certificateExpiry: toJsDate(
        toSurrealDateTime(Date.now() + 1000 * 60 * 60 * 24 * 45)
      ).toISOString(),
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
        queuedForSubmission: true,
      },
    };
  }
}
