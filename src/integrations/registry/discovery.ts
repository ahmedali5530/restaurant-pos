import { ProviderCatalog } from '@/integrations/registry/provider-catalog.ts';

export class BundledProviderDiscovery {
  discoverCatalog() {
    return new ProviderCatalog();
  }
}
