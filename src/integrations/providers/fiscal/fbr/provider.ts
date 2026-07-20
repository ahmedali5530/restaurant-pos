import { IntegrationProvider, ProviderExecutionContext } from '@/integrations/core/provider.ts';
import {
  IntegrationExecutionRequest,
  IntegrationExecutionResponse,
  IntegrationHealthSnapshot,
  ProviderCapability,
  ProviderConfigurationSchema,
  ProviderManifest,
} from '@/integrations/core/types.ts';
import { nowSurrealDateTime, toJsDate } from '@/lib/datetime.ts';
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
        { key: 'sellerNtn', label: 'Seller NTN', type: 'text', required: true },
        { key: 'posId', label: 'POS ID', type: 'text', required: true },
      ],
    },
    {
      id: 'fiscal',
      title: 'Fiscal',
      fields: [
        { key: 'defaultPctCode', label: 'Default PCT Code', type: 'text', required: true },
        { key: 'invoiceType', label: 'Invoice Type', type: 'number', defaultValue: 1 },
        {
          key: 'punjabMode',
          label: 'Punjab Mode (TotalAmount without tax)',
          type: 'switch',
          defaultValue: false,
          helpText: 'When enabled, line TotalAmount = Quantity × SaleValue (FBR Punjab).',
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
          defaultValue: 50,
          helpText: 'Higher priority prints first when multiple fiscal providers return a QR.',
        },
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
  authenticationType: 'bearer',
  supportsQueue: true,
  supportsRetry: true,
  supportsWebhooks: false,
  supportsCertificates: false,
  supportsBackgroundJobs: true,
  configurationSchema: schema,
};

export class FbrProvider implements IntegrationProvider {
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
    return ['execute', 'health', 'queue', 'retry', 'configuration', 'events'];
  }
  supports(capability: ProviderCapability) {
    return this.getCapabilities().includes(capability);
  }
  async validate() {
    const config = await this.getConfig();
    const parsed = parsePkFiscalProviderConfig(config, { requireSellerNtn: true });
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
      averageResponseTimeMs: 150,
      pendingJobs: 0,
      failedJobs: 0,
      lastSynchronization: toJsDate(nowSurrealDateTime()).toISOString(),
      version: manifest.providerVersion,
      updatedAt: toJsDate(nowSurrealDateTime()).toISOString(),
      errors: validation.errors,
    };
  }
  async execute(
    request: IntegrationExecutionRequest,
    _context: ProviderExecutionContext
  ): Promise<IntegrationExecutionResponse> {
    return submitPkFiscalInvoiceRequest(manifest.id, 'fbr', request, this.getConfig, this.transport);
  }
}
