import { IntegrationProvider } from '@/integrations/core/provider.ts';
import { ProviderVersionMismatchError } from '@/integrations/core/errors.ts';

export class ProviderRegistry {
  private readonly providers = new Map<string, IntegrationProvider>();

  constructor(private readonly frameworkVersion: string) {}

  register(provider: IntegrationProvider) {
    const manifest = provider.getManifest();
    if (this.providers.has(manifest.id)) {
      return;
    }

    if (!this.isVersionCompatible(manifest.minimumFrameworkVersion)) {
      throw new ProviderVersionMismatchError(
        manifest.id,
        manifest.minimumFrameworkVersion,
        this.frameworkVersion
      );
    }

    this.providers.set(manifest.id, provider);
  }

  unregister(providerId: string) {
    this.providers.delete(providerId);
  }

  get(providerId: string) {
    return this.providers.get(providerId);
  }

  getAll() {
    return Array.from(this.providers.values());
  }

  getInstalledManifests() {
    return this.getAll().map((provider) => provider.getManifest());
  }

  private isVersionCompatible(minimumVersion: string) {
    // Lightweight semantic-like comparison for x.y.z
    const current = this.frameworkVersion.split('.').map((part) => Number(part) || 0);
    const minimum = minimumVersion.split('.').map((part) => Number(part) || 0);
    const maxLength = Math.max(current.length, minimum.length);
    for (let i = 0; i < maxLength; i += 1) {
      const currentPart = current[i] ?? 0;
      const minimumPart = minimum[i] ?? 0;
      if (currentPart > minimumPart) return true;
      if (currentPart < minimumPart) return false;
    }
    return true;
  }
}
