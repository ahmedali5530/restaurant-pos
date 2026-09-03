import { describe, expect, it } from 'vitest';
import { ProviderCatalog } from '@/integrations/registry/provider-catalog.ts';
import { IntegrationProvider } from '@/integrations/core/provider.ts';

const mockProvider: IntegrationProvider = {
  async initialize() {},
  async shutdown() {},
  getManifest() {
    return {
      id: 'provider:mock',
      name: 'mock',
      displayName: 'Mock',
      category: 'custom',
      version: '1.0.0',
      providerVersion: '1.0.0',
      minimumFrameworkVersion: '1.0.0',
      supportedFeatures: [],
      supportedEvents: [],
      offlineSupport: true,
      requiresInternet: false,
      requiresAuthentication: false,
      supportsQueue: true,
      supportsRetry: true,
      supportsWebhooks: false,
      supportsCertificates: false,
      supportsBackgroundJobs: false,
      configurationSchema: { fields: [] },
    };
  },
  getConfigurationSchema() {
    return { fields: [] };
  },
  getCapabilities() {
    return [];
  },
  supports() {
    return false;
  },
  async validate() {
    return { valid: true };
  },
};

describe('ProviderCatalog', () => {
  it('lists manifests from factories', () => {
    const catalog = new ProviderCatalog({
      'provider:mock': () => mockProvider,
    });
    const manifests = catalog.listCatalogManifests();
    expect(manifests).toHaveLength(1);
    expect(manifests[0].id).toBe('provider:mock');
  });

  it('throws for unknown provider id', () => {
    const catalog = new ProviderCatalog({});
    expect(() => catalog.createProvider('provider:missing')).toThrowError('Unknown provider');
  });
});
