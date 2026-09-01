import { IntegrationProvider } from '@/integrations/core/provider.ts';
import { ProviderManifest } from '@/integrations/core/types.ts';
import { PROVIDER_CATALOG, ProviderFactory } from '@/integrations/providers/index.ts';

export class ProviderCatalog {
  constructor(private readonly factories: Record<string, ProviderFactory> = PROVIDER_CATALOG) {}

  isKnownProvider(providerId: string) {
    return Boolean(this.factories[providerId]);
  }

  createProvider(providerId: string): IntegrationProvider {
    const factory = this.factories[providerId];
    if (!factory) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    return factory();
  }

  getProviderIds(): string[] {
    return Object.keys(this.factories);
  }

  listCatalogManifests(): ProviderManifest[] {
    return this.getProviderIds().map((providerId) => this.createProvider(providerId).getManifest());
  }
}
