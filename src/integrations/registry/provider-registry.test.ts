import { describe, expect, it } from 'vitest';
import { ProviderRegistry } from '@/integrations/registry/provider-registry.ts';
import { IntegrationProvider } from '@/integrations/core/provider.ts';

const createProvider = (id: string, minimumFrameworkVersion = '1.0.0'): IntegrationProvider => ({
  async initialize() {},
  async shutdown() {},
  getManifest() {
    return {
      id,
      name: id,
      displayName: id,
      category: 'custom',
      version: '1.0.0',
      providerVersion: '1.0.0',
      minimumFrameworkVersion,
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
});

describe('ProviderRegistry', () => {
  it('registers compatible providers', () => {
    const registry = new ProviderRegistry('1.2.0');
    registry.register(createProvider('provider:a'));
    expect(registry.get('provider:a')).toBeDefined();
    expect(registry.getInstalledManifests()).toHaveLength(1);
  });

  it('rejects incompatible providers', () => {
    const registry = new ProviderRegistry('1.0.0');
    expect(() => registry.register(createProvider('provider:b', '2.0.0'))).toThrowError();
  });
});
