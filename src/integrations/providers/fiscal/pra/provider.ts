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
import { TransportRouter } from '@/integrations/transport/router.ts';
import {
  FiscalConfigLoader,
  parsePkFiscalProviderConfig,
  submitPkFiscalInvoiceRequest,
} from '@/integrations/providers/fiscal/pk-fbr-pra/index.ts';

const schema: ProviderConfigurationSchema = {
  sections: [
    {
      id: 'credentials',
      title: 'Credentials',
      fields: [
        { key: 'apiBaseUrl', label: 'API Base URL', type: 'text', required: true },
        { key: 'bearerToken', label: 'Bearer Token', type: 'password', required: true, encrypted: true },
        { key: 'posId', label: 'POS ID', type: 'text', required: true },
      ],
    },
    {
      id: 'fiscal',
      title: 'Fiscal',
      fields: [
        { key: 'defaultPctCode', label: 'Default PCT Code', type: 'text', required: true },
        { key: 'invoiceType', label: 'Invoice Type', type: 'number', defaultValue: 1 },
      ],
    },
    {
      id: 'certificates',
      title: 'Certificates',
      fields: [
        {
          key: 'clientCertificate',
          label: 'Client Certificate',
          type: 'certificate',
          required: false,
          helpText: 'Optional; reserved for future mTLS. Auth uses Bearer token.',
        },
      ],
    },
    {
      id: 'runtime',
      title: 'Runtime',
      fields: [
        { key: 'offlineBuffering', label: 'Offline Buffering', type: 'switch', defaultValue: true },
        { key: 'requestTimeoutSeconds', label: 'Request Timeout (seconds)', type: 'number', defaultValue: 30 },
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
          defaultValue: 100,
          helpText: 'Higher priority prints first when multiple fiscal providers return a QR. Default 100 so PRA prints above FBR (50).',
        },
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
  authenticationType: 'bearer',
  supportsQueue: true,
  supportsRetry: true,
  supportsWebhooks: false,
  supportsCertificates: true,
  supportsBackgroundJobs: true,
  configurationSchema: schema,
};

export class PraProvider implements IntegrationProvider {
  private getConfig: FiscalConfigLoader = async () => ({});
  private transport = new TransportRouter();

  setConfigLoader(loader: FiscalConfigLoader) {
    this.getConfig = loader;
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
    return ['execute', 'health', 'queue', 'retry', 'certificates', 'configuration', 'events'];
  }
  supports(capability: ProviderCapability) {
    return this.getCapabilities().includes(capability);
  }
  async validate() {
    const config = await this.getConfig();
    const parsed = parsePkFiscalProviderConfig(config);
    if ('error' in parsed) {
      return { valid: false, errors: [parsed.error] };
    }
    return { valid: true };
  }
  async healthCheck(): Promise<IntegrationHealthSnapshot> {
    const validation = await this.validate();
    return {
      providerId: manifest.id,
      status: validation.valid ? 'connected' : 'disconnected',
      authenticationStatus: validation.valid ? 'valid' : 'invalid',
      averageResponseTimeMs: 180,
      pendingJobs: 0,
      failedJobs: 0,
      lastSynchronization: toJsDate(nowSurrealDateTime()).toISOString(),
      certificateExpiry: toJsDate(
        toSurrealDateTime(Date.now() + 1000 * 60 * 60 * 24 * 45)
      ).toISOString(),
      version: manifest.providerVersion,
      updatedAt: toJsDate(nowSurrealDateTime()).toISOString(),
      errors: validation.errors,
    };
  }
  async execute(
    request: IntegrationExecutionRequest,
    _context: ProviderExecutionContext
  ): Promise<IntegrationExecutionResponse> {
    return submitPkFiscalInvoiceRequest(manifest.id, 'pra', request, this.getConfig, this.transport);
  }
}
